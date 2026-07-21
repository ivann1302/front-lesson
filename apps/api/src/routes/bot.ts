import { randomBytes, randomUUID } from "node:crypto";

import {
  botAnswerRequestSchema,
  botPauseRequestSchema,
  botSettingsRequestSchema,
  botTodayRequestSchema,
  topicSchema,
  type BotAnswerResponse,
  type BotSettingsResponse,
  type BotTodayResponse,
  type ChoiceOption,
} from "@mentor/shared";
import { and, eq, lt } from "drizzle-orm";
import type { FastifyInstance } from "fastify";

import type { AppDatabase } from "../db/database.js";
import {
  authIdentities,
  notificationSettings,
  telegramQuizCallbacks,
  userTopicPreferences,
  users,
} from "../db/schema.js";
import { getHeaderValue, hasValidInternalSecret } from "../security/internal-secret.js";
import { submitAnswerForUser } from "../services/answer.js";
import { getTodayForUser } from "./study.js";

const callbackTtlMs = 24 * 60 * 60 * 1_000;

function createCallbackToken(): string {
  return randomBytes(9).toString("base64url");
}

async function findTelegramUser(db: AppDatabase, telegramUserId: string) {
  const [user] = await db
    .select({ id: users.id, timezone: users.timezone })
    .from(authIdentities)
    .innerJoin(users, eq(authIdentities.userId, users.id))
    .where(
      and(
        eq(authIdentities.provider, "telegram"),
        eq(authIdentities.providerUserId, telegramUserId),
      ),
    )
    .limit(1);
  return user;
}

async function readBotSettings(
  db: AppDatabase,
  user: NonNullable<Awaited<ReturnType<typeof findTelegramUser>>>,
): Promise<BotSettingsResponse> {
  const [settings, topicRows] = await Promise.all([
    db
      .select({
        dailyLimit: notificationSettings.dailyLimit,
        localTime: notificationSettings.localTime,
        timezone: notificationSettings.timezone,
        weekdays: notificationSettings.weekdays,
        channel: notificationSettings.channel,
        pausedUntil: notificationSettings.pausedUntil,
      })
      .from(notificationSettings)
      .where(eq(notificationSettings.userId, user.id))
      .limit(1),
    db
      .select({ topic: userTopicPreferences.topic })
      .from(userTopicPreferences)
      .where(eq(userTopicPreferences.userId, user.id)),
  ]);
  const selectedTopics = new Set(topicRows.map((row) => row.topic));

  return {
    topics: topicRows.length
      ? topicSchema.options.filter((topic) => selectedTopics.has(topic))
      : [...topicSchema.options],
    dailyLimit: settings[0]?.dailyLimit ?? 5,
    localTime: settings[0]?.localTime ?? "19:00",
    timezone: settings[0]?.timezone ?? user.timezone,
    weekdays: settings[0]?.weekdays ?? [1, 2, 3, 4, 5, 6, 7],
    channel: settings[0]?.channel ?? "none",
    pausedUntil: settings[0]?.pausedUntil?.toISOString() ?? null,
  };
}

export function registerBotRoutes(
  app: FastifyInstance,
  db: AppDatabase,
  telegramInternalSecret: string | undefined,
) {
  app.post("/bot/study/today", async (request, reply) => {
    if (!telegramInternalSecret) {
      return reply.code(503).send({ error: "TELEGRAM_BOT_NOT_CONFIGURED" });
    }

    const internalSecret = getHeaderValue(request.headers["x-telegram-internal-secret"]);
    if (!hasValidInternalSecret(internalSecret, telegramInternalSecret)) {
      return reply.code(401).send({ error: "UNAUTHORIZED" });
    }

    const parsed = botTodayRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: "VALIDATION_ERROR", details: parsed.error.flatten() });
    }

    const user = await findTelegramUser(db, parsed.data.telegramUserId);
    if (!user) return reply.code(404).send({ error: "TELEGRAM_IDENTITY_NOT_FOUND" });

    const today = await getTodayForUser(db, user);
    const nextItem = today.items.find((item) => item.status === "pending");
    const now = new Date();
    let callbackOptions: { text: string; callbackData: string }[] | undefined;

    if (nextItem?.type === "single_choice" && "options" in nextItem) {
      await db
        .delete(telegramQuizCallbacks)
        .where(
          and(eq(telegramQuizCallbacks.userId, user.id), lt(telegramQuizCallbacks.expiresAt, now)),
        )
        .run();

      const callbacks = (nextItem.options as ChoiceOption[]).map((option) => ({
        token: createCallbackToken(),
        userId: user.id,
        sessionId: today.session.id,
        contentId: nextItem.id,
        optionId: option.id,
        clientAnswerId: randomUUID(),
        expiresAt: new Date(now.getTime() + callbackTtlMs),
        createdAt: now,
        text: option.text,
      }));
      await db
        .insert(telegramQuizCallbacks)
        .values(
          callbacks.map((callback) => ({
            token: callback.token,
            userId: callback.userId,
            sessionId: callback.sessionId,
            contentId: callback.contentId,
            optionId: callback.optionId,
            clientAnswerId: callback.clientAnswerId,
            expiresAt: callback.expiresAt,
            createdAt: callback.createdAt,
          })),
        )
        .run();
      callbackOptions = callbacks.map((callback) => ({
        text: callback.text,
        callbackData: `answer:${callback.token}`,
      }));
    }

    return reply.send({
      session: today.session,
      nextItem: nextItem
        ? {
            id: nextItem.id,
            type: nextItem.type,
            topic: nextItem.topic,
            prompt: nextItem.prompt,
            estimatedSeconds: nextItem.estimatedSeconds,
            ...(callbackOptions ? { options: callbackOptions } : {}),
          }
        : null,
    } satisfies BotTodayResponse);
  });

  app.post("/bot/answers", async (request, reply) => {
    if (!telegramInternalSecret) {
      return reply.code(503).send({ error: "TELEGRAM_BOT_NOT_CONFIGURED" });
    }

    const internalSecret = getHeaderValue(request.headers["x-telegram-internal-secret"]);
    if (!hasValidInternalSecret(internalSecret, telegramInternalSecret)) {
      return reply.code(401).send({ error: "UNAUTHORIZED" });
    }

    const parsed = botAnswerRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: "VALIDATION_ERROR", details: parsed.error.flatten() });
    }

    const user = await findTelegramUser(db, parsed.data.telegramUserId);
    if (!user) return reply.code(404).send({ error: "TELEGRAM_IDENTITY_NOT_FOUND" });

    const token = parsed.data.callbackData.slice("answer:".length);
    const [callback] = await db
      .select()
      .from(telegramQuizCallbacks)
      .where(and(eq(telegramQuizCallbacks.token, token), eq(telegramQuizCallbacks.userId, user.id)))
      .limit(1);
    if (!callback) return reply.code(404).send({ error: "CALLBACK_NOT_FOUND" });
    if (callback.expiresAt.getTime() <= Date.now()) {
      return reply.code(410).send({ error: "CALLBACK_EXPIRED" });
    }

    const result = await submitAnswerForUser(db, user.id, {
      clientAnswerId: callback.clientAnswerId,
      sessionId: callback.sessionId,
      contentId: callback.contentId,
      answer: { kind: "selection", selectedOptionIds: [callback.optionId] },
    });
    if ("error" in result) return reply.code(result.statusCode).send({ error: result.error });
    if (result.response.answer.isCorrect === null) {
      return reply.code(500).send({ error: "INVALID_BOT_ANSWER_RESULT" });
    }

    await db
      .update(telegramQuizCallbacks)
      .set({ usedAt: new Date() })
      .where(eq(telegramQuizCallbacks.token, callback.token))
      .run();

    return reply.code(result.statusCode).send({
      answer: { isCorrect: result.response.answer.isCorrect },
      feedback: { explanation: result.response.feedback.explanation },
      session: result.response.session,
    } satisfies BotAnswerResponse);
  });

  app.post("/bot/settings", async (request, reply) => {
    if (!telegramInternalSecret) {
      return reply.code(503).send({ error: "TELEGRAM_BOT_NOT_CONFIGURED" });
    }

    const internalSecret = getHeaderValue(request.headers["x-telegram-internal-secret"]);
    if (!hasValidInternalSecret(internalSecret, telegramInternalSecret)) {
      return reply.code(401).send({ error: "UNAUTHORIZED" });
    }

    const parsed = botSettingsRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: "VALIDATION_ERROR", details: parsed.error.flatten() });
    }

    const user = await findTelegramUser(db, parsed.data.telegramUserId);
    if (!user) return reply.code(404).send({ error: "TELEGRAM_IDENTITY_NOT_FOUND" });
    return reply.send(await readBotSettings(db, user));
  });

  app.post("/bot/settings/pause", async (request, reply) => {
    if (!telegramInternalSecret) {
      return reply.code(503).send({ error: "TELEGRAM_BOT_NOT_CONFIGURED" });
    }

    const internalSecret = getHeaderValue(request.headers["x-telegram-internal-secret"]);
    if (!hasValidInternalSecret(internalSecret, telegramInternalSecret)) {
      return reply.code(401).send({ error: "UNAUTHORIZED" });
    }

    const parsed = botPauseRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: "VALIDATION_ERROR", details: parsed.error.flatten() });
    }

    const user = await findTelegramUser(db, parsed.data.telegramUserId);
    if (!user) return reply.code(404).send({ error: "TELEGRAM_IDENTITY_NOT_FOUND" });

    const pauseDuration = parsed.data.action === "day" ? 86_400_000 : 7 * 86_400_000;
    const pausedUntil =
      parsed.data.action === "resume" ? null : new Date(Date.now() + pauseDuration);
    await db
      .update(notificationSettings)
      .set({ pausedUntil })
      .where(eq(notificationSettings.userId, user.id))
      .run();

    return reply.send(await readBotSettings(db, user));
  });
}
