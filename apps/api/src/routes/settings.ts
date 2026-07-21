import {
  topicSchema,
  updateSettingsRequestSchema,
  type Topic,
  type UserSettings,
} from "@mentor/shared";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";

import type { AppDatabase } from "../db/database.js";
import { authIdentities, notificationSettings, userTopicPreferences, users } from "../db/schema.js";

function getHeaderToken(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

async function getGuestUser(db: AppDatabase, guestToken: string) {
  const [user] = await db
    .select({
      id: users.id,
      timezone: users.timezone,
      onboardingCompleted: users.onboardingCompleted,
    })
    .from(authIdentities)
    .innerJoin(users, eq(authIdentities.userId, users.id))
    .where(and(eq(authIdentities.provider, "guest"), eq(authIdentities.providerUserId, guestToken)))
    .limit(1);
  return user;
}

async function readSettings(db: AppDatabase, user: Awaited<ReturnType<typeof getGuestUser>>) {
  if (!user) return undefined;
  const [settings, topicRows] = await Promise.all([
    db
      .select({
        dailyLimit: notificationSettings.dailyLimit,
        localTime: notificationSettings.localTime,
        timezone: notificationSettings.timezone,
      })
      .from(notificationSettings)
      .where(eq(notificationSettings.userId, user.id))
      .limit(1),
    db
      .select({ topic: userTopicPreferences.topic })
      .from(userTopicPreferences)
      .where(eq(userTopicPreferences.userId, user.id)),
  ]);
  const selected = new Set(topicRows.map((row) => row.topic));
  const topics = topicRows.length
    ? topicSchema.options.filter((topic) => selected.has(topic))
    : [...topicSchema.options];

  return {
    onboardingCompleted: user.onboardingCompleted,
    topics,
    dailyLimit: settings[0]?.dailyLimit ?? 5,
    localTime: settings[0]?.localTime ?? "19:00",
    timezone: settings[0]?.timezone ?? user.timezone,
  } satisfies UserSettings;
}

export function registerSettingsRoutes(app: FastifyInstance, db: AppDatabase) {
  app.get("/settings", async (request, reply) => {
    const guestToken = getHeaderToken(request.headers["x-guest-token"]);
    if (!guestToken) return reply.code(401).send({ error: "UNAUTHORIZED" });

    const user = await getGuestUser(db, guestToken);
    if (!user) return reply.code(401).send({ error: "UNAUTHORIZED" });
    return reply.send(await readSettings(db, user));
  });

  app.put("/settings", async (request, reply) => {
    const guestToken = getHeaderToken(request.headers["x-guest-token"]);
    if (!guestToken) return reply.code(401).send({ error: "UNAUTHORIZED" });

    const user = await getGuestUser(db, guestToken);
    if (!user) return reply.code(401).send({ error: "UNAUTHORIZED" });

    const parsed = updateSettingsRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: "VALIDATION_ERROR", details: parsed.error.flatten() });
    }

    const settings = parsed.data;
    await db.transaction(async (transaction) => {
      await transaction
        .update(users)
        .set({ timezone: settings.timezone, onboardingCompleted: true })
        .where(eq(users.id, user.id))
        .run();
      await transaction
        .insert(notificationSettings)
        .values({
          userId: user.id,
          channel: "none",
          localTime: settings.localTime,
          timezone: settings.timezone,
          weekdays: [1, 2, 3, 4, 5, 6, 7],
          dailyLimit: settings.dailyLimit,
        })
        .onConflictDoUpdate({
          target: notificationSettings.userId,
          set: {
            localTime: settings.localTime,
            timezone: settings.timezone,
            dailyLimit: settings.dailyLimit,
          },
        })
        .run();
      await transaction
        .delete(userTopicPreferences)
        .where(eq(userTopicPreferences.userId, user.id))
        .run();
      await transaction
        .insert(userTopicPreferences)
        .values(settings.topics.map((topic: Topic) => ({ userId: user.id, topic })))
        .run();
    });

    return reply.send({ onboardingCompleted: true, ...settings } satisfies UserSettings);
  });
}
