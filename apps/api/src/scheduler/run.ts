import { randomUUID } from "node:crypto";

import { and, eq, lt, lte } from "drizzle-orm";

import type { AppDatabase } from "../db/database.js";
import {
  authIdentities,
  deliveryLog,
  notificationSettings,
  studySessions,
  users,
} from "../db/schema.js";
import {
  classifyDeliveryError,
  DELIVERY_LEASE_MS,
  MAX_DELIVERY_ATTEMPTS,
  retryDelayMs,
} from "./retry.js";
import type { TelegramReminder } from "./telegram.js";
import { localMinute, type LocalMinute } from "./time.js";

export const DAILY_REMINDER_TYPE = "daily_reminder";
export const REMINDER_CATCH_UP_MINUTES = 60;

export type SendReminder = (reminder: TelegramReminder) => Promise<void>;

export type SchedulerTickResult = {
  checked: number;
  due: number;
  retryDue: number;
  claimed: number;
  retried: number;
  sent: number;
  deferred: number;
  failed: number;
  disabled: number;
  skippedCompleted: number;
  duplicate: number;
};

async function readCandidates(db: AppDatabase) {
  return db
    .select({
      userId: users.id,
      telegramUserId: authIdentities.providerUserId,
      localTime: notificationSettings.localTime,
      timezone: notificationSettings.timezone,
      weekdays: notificationSettings.weekdays,
      dailyLimit: notificationSettings.dailyLimit,
      pausedUntil: notificationSettings.pausedUntil,
    })
    .from(notificationSettings)
    .innerJoin(users, eq(notificationSettings.userId, users.id))
    .innerJoin(
      authIdentities,
      and(eq(authIdentities.userId, users.id), eq(authIdentities.provider, "telegram")),
    )
    .where(and(eq(notificationSettings.channel, "telegram"), eq(users.status, "active")));
}

type Candidate = Awaited<ReturnType<typeof readCandidates>>[number];

function isPaused(candidate: Candidate, now: Date): boolean {
  return Boolean(candidate.pausedUntil && candidate.pausedUntil > now);
}

function minuteOfDay(value: string): number | undefined {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return undefined;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return undefined;
  return hour * 60 + minute;
}

function previousLocalDate(localDate: string): string {
  const date = new Date(`${localDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function dueLocalMinute(candidate: Candidate, now: Date): LocalMinute | undefined {
  const local = localMinute(now, candidate.timezone);
  if (!local) return undefined;
  const currentMinute = minuteOfDay(local.localTime);
  const scheduledMinute = minuteOfDay(candidate.localTime);
  if (currentMinute === undefined || scheduledMinute === undefined) return undefined;

  const elapsedMinutes =
    currentMinute >= scheduledMinute
      ? currentMinute - scheduledMinute
      : 24 * 60 - scheduledMinute + currentMinute;
  if (elapsedMinutes > REMINDER_CATCH_UP_MINUTES) return undefined;

  const crossedMidnight = currentMinute < scheduledMinute;
  const scheduled = crossedMidnight
    ? {
        localDate: previousLocalDate(local.localDate),
        localTime: candidate.localTime,
        weekday: local.weekday === 1 ? 7 : local.weekday - 1,
      }
    : { ...local, localTime: candidate.localTime };
  return candidate.weekdays.includes(scheduled.weekday) ? scheduled : undefined;
}

async function hasCompletedDailySession(
  db: AppDatabase,
  userId: string,
  localDate: string,
): Promise<boolean> {
  const completed = await db
    .select({ id: studySessions.id })
    .from(studySessions)
    .where(
      and(
        eq(studySessions.userId, userId),
        eq(studySessions.localDate, localDate),
        eq(studySessions.kind, "daily"),
        eq(studySessions.status, "completed"),
      ),
    )
    .limit(1);
  return completed.length > 0;
}

async function finishDelivery(
  db: AppDatabase,
  deliveryId: string,
  userId: string,
  localDate: string,
  attempts: number,
  sendReminder: SendReminder,
  reminder: TelegramReminder,
  now: Date,
  result: SchedulerTickResult,
): Promise<void> {
  if (await hasCompletedDailySession(db, userId, localDate)) {
    await db
      .update(deliveryLog)
      .set({
        status: "skipped",
        errorCode: "SESSION_COMPLETED",
        nextAttemptAt: null,
        deliveredAt: null,
      })
      .where(eq(deliveryLog.id, deliveryId))
      .run();
    result.skippedCompleted += 1;
    return;
  }

  try {
    await sendReminder(reminder);
    await db
      .update(deliveryLog)
      .set({
        status: "sent",
        errorCode: null,
        nextAttemptAt: null,
        deliveredAt: now,
      })
      .where(eq(deliveryLog.id, deliveryId))
      .run();
    result.sent += 1;
  } catch (error) {
    const failure = classifyDeliveryError(error);
    if (failure.retryable && attempts < MAX_DELIVERY_ATTEMPTS) {
      await db
        .update(deliveryLog)
        .set({
          status: "pending",
          errorCode: failure.code,
          nextAttemptAt: new Date(
            now.getTime() + retryDelayMs(attempts, failure.retryAfterSeconds),
          ),
        })
        .where(eq(deliveryLog.id, deliveryId))
        .run();
      result.deferred += 1;
      return;
    }

    await db.transaction(async (transaction) => {
      await transaction
        .update(deliveryLog)
        .set({ status: "failed", errorCode: failure.code, nextAttemptAt: null })
        .where(eq(deliveryLog.id, deliveryId))
        .run();
      if (failure.disableChannel) {
        await transaction
          .update(notificationSettings)
          .set({ channel: "none" })
          .where(eq(notificationSettings.userId, userId))
          .run();
      }
    });
    result.failed += 1;
    if (failure.disableChannel) result.disabled += 1;
  }
}

export async function runSchedulerTick(
  db: AppDatabase,
  sendReminder: SendReminder,
  now = new Date(),
): Promise<SchedulerTickResult> {
  const candidates = await readCandidates(db);
  const candidateByUserId = new Map(candidates.map((candidate) => [candidate.userId, candidate]));
  const result: SchedulerTickResult = {
    checked: candidates.length,
    due: 0,
    retryDue: 0,
    claimed: 0,
    retried: 0,
    sent: 0,
    deferred: 0,
    failed: 0,
    disabled: 0,
    skippedCompleted: 0,
    duplicate: 0,
  };

  const retries = await db
    .select({
      id: deliveryLog.id,
      userId: deliveryLog.userId,
      localDate: deliveryLog.localDate,
      attempts: deliveryLog.attempts,
    })
    .from(deliveryLog)
    .where(
      and(
        eq(deliveryLog.notificationType, DAILY_REMINDER_TYPE),
        eq(deliveryLog.status, "pending"),
        lte(deliveryLog.nextAttemptAt, now),
        lt(deliveryLog.attempts, MAX_DELIVERY_ATTEMPTS),
      ),
    );

  for (const retry of retries) {
    const candidate = candidateByUserId.get(retry.userId);
    if (!candidate || isPaused(candidate, now)) continue;
    result.retryDue += 1;
    const attempts = retry.attempts + 1;
    const claimed = await db
      .update(deliveryLog)
      .set({
        attempts,
        lastAttemptAt: now,
        nextAttemptAt: new Date(now.getTime() + DELIVERY_LEASE_MS),
      })
      .where(
        and(
          eq(deliveryLog.id, retry.id),
          eq(deliveryLog.status, "pending"),
          eq(deliveryLog.attempts, retry.attempts),
          lte(deliveryLog.nextAttemptAt, now),
        ),
      )
      .run();
    if (claimed.rowsAffected !== 1) continue;
    result.retried += 1;

    await finishDelivery(
      db,
      retry.id,
      candidate.userId,
      retry.localDate,
      attempts,
      sendReminder,
      { telegramUserId: candidate.telegramUserId, dailyLimit: candidate.dailyLimit },
      now,
      result,
    );
  }

  for (const candidate of candidates) {
    if (isPaused(candidate, now)) continue;
    const local = dueLocalMinute(candidate, now);
    if (!local) continue;
    result.due += 1;

    const deliveryId = randomUUID();
    const claimed = await db
      .insert(deliveryLog)
      .values({
        id: deliveryId,
        userId: candidate.userId,
        localDate: local.localDate,
        notificationType: DAILY_REMINDER_TYPE,
        status: "pending",
        attempts: 1,
        lastAttemptAt: now,
        nextAttemptAt: new Date(now.getTime() + DELIVERY_LEASE_MS),
      })
      .onConflictDoNothing({
        target: [deliveryLog.userId, deliveryLog.localDate, deliveryLog.notificationType],
      })
      .returning({ id: deliveryLog.id });

    if (!claimed.length) {
      result.duplicate += 1;
      continue;
    }
    result.claimed += 1;

    await finishDelivery(
      db,
      deliveryId,
      candidate.userId,
      local.localDate,
      1,
      sendReminder,
      { telegramUserId: candidate.telegramUserId, dailyLimit: candidate.dailyLimit },
      now,
      result,
    );
  }

  return result;
}
