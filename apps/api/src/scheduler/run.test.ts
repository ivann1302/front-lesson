import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createDatabase, type DatabaseHandle } from "../db/database";
import {
  authIdentities,
  deliveryLog,
  notificationSettings,
  studySessions,
  users,
} from "../db/schema";
import { runSchedulerTick } from "./run";
import { TelegramSendError } from "./telegram";

const databases: DatabaseHandle[] = [];
const now = new Date("2026-07-16T16:30:00.000Z");

async function createTestDatabase(): Promise<DatabaseHandle> {
  const database = createDatabase(":memory:");
  databases.push(database);
  await database.ready;
  return database;
}

async function addCandidate(
  database: DatabaseHandle,
  overrides: {
    localTime?: string;
    weekdays?: number[];
    pausedUntil?: Date | null;
    channel?: "none" | "telegram";
    status?: "active" | "paused";
  } = {},
) {
  const userId = randomUUID();
  const telegramUserId = String(Math.floor(Math.random() * 1_000_000_000));
  await database.db.insert(users).values({
    id: userId,
    timezone: "Europe/Moscow",
    status: overrides.status ?? "active",
    createdAt: now,
  });
  await database.db.insert(authIdentities).values({
    id: randomUUID(),
    userId,
    provider: "telegram",
    providerUserId: telegramUserId,
    createdAt: now,
  });
  await database.db.insert(notificationSettings).values({
    userId,
    channel: overrides.channel ?? "telegram",
    localTime: overrides.localTime ?? "19:30",
    timezone: "Europe/Moscow",
    weekdays: overrides.weekdays ?? [4],
    dailyLimit: 5,
    pausedUntil: overrides.pausedUntil,
  });
  return { userId, telegramUserId };
}

async function completeDailySession(database: DatabaseHandle, userId: string) {
  await database.db.insert(studySessions).values({
    id: randomUUID(),
    userId,
    kind: "daily",
    localDate: "2026-07-16",
    status: "completed",
    createdAt: now,
    completedAt: now,
  });
}

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

describe("runSchedulerTick", () => {
  it("sends only reminders due in the user's local catch-up window", async () => {
    const database = await createTestDatabase();
    const due = await addCandidate(database);
    await addCandidate(database, { localTime: "19:31" });
    await addCandidate(database, { weekdays: [5] });
    await addCandidate(database, { pausedUntil: new Date(now.getTime() + 60_000) });
    await addCandidate(database, { channel: "none" });
    await addCandidate(database, { status: "paused" });
    const sendReminder = vi.fn().mockResolvedValue(undefined);

    const result = await runSchedulerTick(database.db, sendReminder, now);

    expect(result).toEqual({
      checked: 4,
      due: 1,
      retryDue: 0,
      claimed: 1,
      retried: 0,
      sent: 1,
      deferred: 0,
      failed: 0,
      disabled: 0,
      skippedCompleted: 0,
      duplicate: 0,
    });
    expect(sendReminder).toHaveBeenCalledWith({
      telegramUserId: due.telegramUserId,
      dailyLimit: 5,
    });
    const delivery = await database.client.execute(
      "SELECT user_id, local_date, notification_type, status, attempts, next_attempt_at, last_attempt_at, delivered_at FROM delivery_log",
    );
    expect(delivery.rows).toHaveLength(1);
    expect(delivery.rows[0]).toMatchObject({
      user_id: due.userId,
      local_date: "2026-07-16",
      notification_type: "daily_reminder",
      status: "sent",
      attempts: 1,
      next_attempt_at: null,
      last_attempt_at: now.getTime(),
    });
    expect(delivery.rows[0]?.delivered_at).not.toBeNull();
  });

  it("catches up a reminder when the scheduler starts late", async () => {
    const database = await createTestDatabase();
    await addCandidate(database, { localTime: "19:05" });
    await addCandidate(database, { localTime: "18:29" });
    const sendReminder = vi.fn().mockResolvedValue(undefined);

    const result = await runSchedulerTick(database.db, sendReminder, now);

    expect(result).toMatchObject({ checked: 2, due: 1, claimed: 1, sent: 1 });
    expect(sendReminder).toHaveBeenCalledOnce();
  });

  it("catches up across local midnight using the scheduled day's delivery key", async () => {
    const database = await createTestDatabase();
    const afterMidnight = new Date("2026-07-16T21:10:00.000Z");
    await addCandidate(database, { localTime: "23:40", weekdays: [4] });
    const sendReminder = vi.fn().mockResolvedValue(undefined);

    const result = await runSchedulerTick(database.db, sendReminder, afterMidnight);

    expect(result).toMatchObject({ due: 1, claimed: 1, sent: 1 });
    const delivery = await database.client.execute("SELECT local_date FROM delivery_log");
    expect(delivery.rows[0]?.local_date).toBe("2026-07-16");
  });

  it("does not deliver the same notification twice", async () => {
    const database = await createTestDatabase();
    await addCandidate(database);
    const sendReminder = vi.fn().mockResolvedValue(undefined);

    const first = await runSchedulerTick(database.db, sendReminder, now);
    const second = await runSchedulerTick(database.db, sendReminder, now);

    expect(first.sent).toBe(1);
    expect(second).toMatchObject({ due: 1, claimed: 0, sent: 0, duplicate: 1 });
    expect(sendReminder).toHaveBeenCalledOnce();
  });

  it("defers a transient error and retries it when backoff expires", async () => {
    const database = await createTestDatabase();
    await addCandidate(database);
    const sendReminder = vi
      .fn()
      .mockRejectedValueOnce(new TelegramSendError("TELEGRAM_500", 500, undefined))
      .mockResolvedValueOnce(undefined);

    const first = await runSchedulerTick(database.db, sendReminder, now);
    const tooEarly = await runSchedulerTick(
      database.db,
      sendReminder,
      new Date(now.getTime() + 30_000),
    );
    const retry = await runSchedulerTick(
      database.db,
      sendReminder,
      new Date(now.getTime() + 60_000),
    );

    expect(first).toMatchObject({ claimed: 1, sent: 0, deferred: 1, failed: 0 });
    expect(tooEarly).toMatchObject({ retryDue: 0, retried: 0, sent: 0 });
    expect(retry).toMatchObject({ retryDue: 1, retried: 1, sent: 1, deferred: 0 });
    expect(sendReminder).toHaveBeenCalledTimes(2);
    const delivery = await database.client.execute(
      "SELECT status, attempts, error_code, next_attempt_at, delivered_at FROM delivery_log",
    );
    expect(delivery.rows[0]).toMatchObject({
      status: "sent",
      attempts: 2,
      error_code: null,
      next_attempt_at: null,
      delivered_at: now.getTime() + 60_000,
    });
  });

  it("honors Telegram retry_after", async () => {
    const database = await createTestDatabase();
    await addCandidate(database);
    const sendReminder = vi.fn().mockRejectedValue(new TelegramSendError("TELEGRAM_429", 429, 180));

    const result = await runSchedulerTick(database.db, sendReminder, now);

    expect(result).toMatchObject({ deferred: 1, failed: 0 });
    const delivery = await database.client.execute(
      "SELECT status, error_code, next_attempt_at FROM delivery_log",
    );
    expect(delivery.rows[0]).toMatchObject({
      status: "pending",
      error_code: "TELEGRAM_429",
      next_attempt_at: now.getTime() + 180_000,
    });
  });

  it("records a permanent error and disables its notification channel", async () => {
    const database = await createTestDatabase();
    const candidate = await addCandidate(database);
    const sendReminder = vi
      .fn()
      .mockRejectedValue(new TelegramSendError("TELEGRAM_403", 403, undefined));

    const result = await runSchedulerTick(database.db, sendReminder, now);

    expect(result).toMatchObject({ deferred: 0, failed: 1, disabled: 1 });
    const delivery = await database.client.execute(
      "SELECT status, attempts, error_code, next_attempt_at FROM delivery_log",
    );
    const settings = await database.client.execute({
      sql: "SELECT channel FROM notification_settings WHERE user_id = ?",
      args: [candidate.userId],
    });
    expect(delivery.rows[0]).toMatchObject({
      status: "failed",
      attempts: 1,
      error_code: "TELEGRAM_403",
      next_attempt_at: null,
    });
    expect(settings.rows[0]?.channel).toBe("none");
  });

  it("stops retrying after five attempts", async () => {
    const database = await createTestDatabase();
    const candidate = await addCandidate(database, { localTime: "18:00" });
    await database.db.insert(deliveryLog).values({
      id: randomUUID(),
      userId: candidate.userId,
      localDate: "2026-07-16",
      notificationType: "daily_reminder",
      status: "pending",
      attempts: 4,
      errorCode: "TELEGRAM_500",
      nextAttemptAt: now,
      lastAttemptAt: new Date(now.getTime() - 480_000),
    });
    const sendReminder = vi
      .fn()
      .mockRejectedValue(new TelegramSendError("TELEGRAM_500", 500, undefined));

    const result = await runSchedulerTick(database.db, sendReminder, now);

    expect(result).toMatchObject({ retryDue: 1, retried: 1, deferred: 0, failed: 1 });
    const delivery = await database.client.execute(
      "SELECT status, attempts, error_code, next_attempt_at FROM delivery_log",
    );
    expect(delivery.rows[0]).toMatchObject({
      status: "failed",
      attempts: 5,
      error_code: "TELEGRAM_500",
      next_attempt_at: null,
    });
  });

  it("skips a reminder when today's daily session is already complete", async () => {
    const database = await createTestDatabase();
    const candidate = await addCandidate(database);
    await completeDailySession(database, candidate.userId);
    const sendReminder = vi.fn().mockResolvedValue(undefined);

    const result = await runSchedulerTick(database.db, sendReminder, now);

    expect(result).toMatchObject({
      due: 1,
      claimed: 1,
      sent: 0,
      skippedCompleted: 1,
    });
    expect(sendReminder).not.toHaveBeenCalled();
    const delivery = await database.client.execute(
      "SELECT status, error_code, next_attempt_at, delivered_at FROM delivery_log",
    );
    expect(delivery.rows[0]).toMatchObject({
      status: "skipped",
      error_code: "SESSION_COMPLETED",
      next_attempt_at: null,
      delivered_at: null,
    });
  });

  it("rechecks session completion immediately before a retry", async () => {
    const database = await createTestDatabase();
    const candidate = await addCandidate(database);
    const sendReminder = vi
      .fn()
      .mockRejectedValueOnce(new TelegramSendError("TELEGRAM_500", 500, undefined))
      .mockResolvedValueOnce(undefined);

    const first = await runSchedulerTick(database.db, sendReminder, now);
    await completeDailySession(database, candidate.userId);
    const retry = await runSchedulerTick(
      database.db,
      sendReminder,
      new Date(now.getTime() + 60_000),
    );

    expect(first.deferred).toBe(1);
    expect(retry).toMatchObject({ retryDue: 1, retried: 1, sent: 0, skippedCompleted: 1 });
    expect(sendReminder).toHaveBeenCalledOnce();
    const delivery = await database.client.execute(
      "SELECT status, attempts, error_code, next_attempt_at FROM delivery_log",
    );
    expect(delivery.rows[0]).toMatchObject({
      status: "skipped",
      attempts: 2,
      error_code: "SESSION_COMPLETED",
      next_attempt_at: null,
    });
  });
});
