import { randomUUID } from "node:crypto";

import { and, asc, eq, inArray, isNotNull, lte } from "drizzle-orm";
import type { FastifyInstance } from "fastify";

import { toPublicContentItem } from "../content/public-item.js";
import type { AppDatabase } from "../db/database.js";
import {
  authIdentities,
  contentItems,
  notificationSettings,
  studySessionItems,
  studySessions,
  userContentState,
  userTopicPreferences,
  users,
} from "../db/schema.js";

const dailySessionLocks = new Map<string, Promise<void>>();

async function withDailySessionLock<T>(key: string, work: () => Promise<T>): Promise<T> {
  const previous = dailySessionLocks.get(key) ?? Promise.resolve();
  let release: () => void = () => undefined;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  dailySessionLocks.set(key, current);
  await previous;

  try {
    return await work();
  } finally {
    release();
    if (dailySessionLocks.get(key) === current) dailySessionLocks.delete(key);
  }
}

function getHeaderToken(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function localDate(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

async function selectQueue(
  db: AppDatabase,
  userId: string,
  limit: number,
  now: Date,
): Promise<string[]> {
  const preferredTopics = (
    await db
      .select({ topic: userTopicPreferences.topic })
      .from(userTopicPreferences)
      .where(eq(userTopicPreferences.userId, userId))
  ).map((row) => row.topic);
  const topicCondition = preferredTopics.length
    ? inArray(contentItems.topic, preferredTopics)
    : undefined;

  const due = await db
    .select({ contentId: userContentState.contentId })
    .from(userContentState)
    .innerJoin(contentItems, eq(userContentState.contentId, contentItems.id))
    .where(
      and(
        eq(userContentState.userId, userId),
        isNotNull(userContentState.dueAt),
        lte(userContentState.dueAt, now),
        topicCondition,
      ),
    )
    .orderBy(asc(userContentState.dueAt))
    .limit(limit);

  const seen = new Set(
    (
      await db
        .select({ contentId: userContentState.contentId })
        .from(userContentState)
        .where(eq(userContentState.userId, userId))
    ).map((row) => row.contentId),
  );
  const selected = due.map((row) => row.contentId);
  const selectedSet = new Set(selected);

  if (selected.length < limit) {
    const fresh = await db
      .select({ id: contentItems.id })
      .from(contentItems)
      .where(topicCondition)
      .orderBy(asc(contentItems.ordinal));

    for (const item of fresh) {
      if (seen.has(item.id) || selectedSet.has(item.id)) continue;
      selected.push(item.id);
      if (selected.length === limit) break;
    }
  }

  return selected;
}

async function findDailySession(db: AppDatabase, userId: string, today: string) {
  const [session] = await db
    .select()
    .from(studySessions)
    .where(
      and(
        eq(studySessions.userId, userId),
        eq(studySessions.localDate, today),
        eq(studySessions.kind, "daily"),
      ),
    )
    .limit(1);
  return session;
}

export async function getTodayForUser(
  db: AppDatabase,
  user: { id: string; timezone: string },
  now = new Date(),
) {
  const [settings] = await db
    .select({ dailyLimit: notificationSettings.dailyLimit })
    .from(notificationSettings)
    .where(eq(notificationSettings.userId, user.id))
    .limit(1);
  const dailyLimit = settings?.dailyLimit ?? 5;
  const today = localDate(now, user.timezone);

  let session = await findDailySession(db, user.id, today);

  if (!session) {
    session = await withDailySessionLock(`${user.id}:${today}`, async () => {
      const existing = await findDailySession(db, user.id, today);
      if (existing) return existing;

      const queue = await selectQueue(db, user.id, dailyLimit, now);
      return db.transaction(async (transaction) => {
        const created = {
          id: randomUUID(),
          userId: user.id,
          kind: "daily" as const,
          localDate: today,
          status: "pending" as const,
          createdAt: now,
          completedAt: null,
        };
        await transaction.insert(studySessions).values(created).run();

        if (queue.length) {
          await transaction
            .insert(studySessionItems)
            .values(
              queue.map((contentId, position) => ({
                sessionId: created.id,
                contentId,
                position,
                status: "pending" as const,
              })),
            )
            .run();
        }
        return created;
      });
    });
  }

  const items = await db
    .select({
      position: studySessionItems.position,
      status: studySessionItems.status,
      payload: contentItems.payload,
    })
    .from(studySessionItems)
    .innerJoin(contentItems, eq(studySessionItems.contentId, contentItems.id))
    .where(eq(studySessionItems.sessionId, session.id))
    .orderBy(asc(studySessionItems.position));

  return {
    session: {
      id: session.id,
      localDate: session.localDate,
      status: session.status,
      answered: items.filter((item) => item.status === "answered").length,
      total: items.length,
    },
    items: items.map((item) => ({
      ...toPublicContentItem(item.payload),
      status: item.status,
    })),
  };
}

export function registerStudyRoutes(app: FastifyInstance, db: AppDatabase) {
  app.get("/study/today", async (request, reply) => {
    const guestToken = getHeaderToken(request.headers["x-guest-token"]);
    if (!guestToken) return reply.code(401).send({ error: "UNAUTHORIZED" });

    const [user] = await db
      .select({ id: users.id, timezone: users.timezone })
      .from(authIdentities)
      .innerJoin(users, eq(authIdentities.userId, users.id))
      .where(
        and(eq(authIdentities.provider, "guest"), eq(authIdentities.providerUserId, guestToken)),
      )
      .limit(1);
    if (!user) return reply.code(401).send({ error: "UNAUTHORIZED" });

    return reply.send(await getTodayForUser(db, user));
  });
}
