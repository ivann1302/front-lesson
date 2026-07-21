import { createHash, randomInt, randomUUID } from "node:crypto";

import {
  telegramLinkRequestSchema,
  type TelegramLinkCodeResponse,
  type TelegramLinkResponse,
} from "@mentor/shared";
import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { AppDatabase } from "../db/database.js";
import { authIdentities, notificationSettings, telegramLinkCodes, users } from "../db/schema.js";
import { getHeaderValue, hasValidInternalSecret } from "../security/internal-secret.js";

const telegramCodeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const telegramCodeTtlMs = 10 * 60 * 1_000;

function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const guestRequestSchema = z.object({
  guestToken: z.string().uuid().optional(),
  timezone: z.string().refine(isTimeZone, "Нужна корректная IANA timezone").default("UTC"),
});

function createTelegramCode(): string {
  return Array.from(
    { length: 8 },
    () => telegramCodeAlphabet[randomInt(telegramCodeAlphabet.length)]!,
  ).join("");
}

function hashTelegramCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

async function findGuestUserId(db: AppDatabase, guestToken: string) {
  const [identity] = await db
    .select({ userId: authIdentities.userId })
    .from(authIdentities)
    .where(and(eq(authIdentities.provider, "guest"), eq(authIdentities.providerUserId, guestToken)))
    .limit(1);
  return identity?.userId;
}

export function registerAuthRoutes(
  app: FastifyInstance,
  db: AppDatabase,
  telegramInternalSecret: string | undefined,
) {
  app.post("/auth/guest", async (request, reply) => {
    const parsed = guestRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: "VALIDATION_ERROR", details: parsed.error.flatten() });
    }

    if (parsed.data.guestToken) {
      const [identity] = await db
        .select({ userId: authIdentities.userId })
        .from(authIdentities)
        .where(
          and(
            eq(authIdentities.provider, "guest"),
            eq(authIdentities.providerUserId, parsed.data.guestToken),
          ),
        )
        .limit(1);

      if (identity) {
        return reply.send({ userId: identity.userId, guestToken: parsed.data.guestToken });
      }
    }

    const now = new Date();
    const userId = randomUUID();
    const guestToken = randomUUID();

    await db.transaction(async (transaction) => {
      await transaction
        .insert(users)
        .values({ id: userId, timezone: parsed.data.timezone, status: "active", createdAt: now })
        .run();
      await transaction
        .insert(authIdentities)
        .values({
          id: randomUUID(),
          userId,
          provider: "guest",
          providerUserId: guestToken,
          createdAt: now,
        })
        .run();
      await transaction
        .insert(notificationSettings)
        .values({
          userId,
          channel: "none",
          localTime: "19:00",
          timezone: parsed.data.timezone,
          weekdays: [1, 2, 3, 4, 5, 6, 7],
          dailyLimit: 5,
        })
        .run();
    });

    return reply.code(201).send({ userId, guestToken });
  });

  app.post("/auth/telegram-code", async (request, reply) => {
    const guestToken = getHeaderValue(request.headers["x-guest-token"]);
    if (!guestToken) return reply.code(401).send({ error: "UNAUTHORIZED" });

    const userId = await findGuestUserId(db, guestToken);
    if (!userId) return reply.code(401).send({ error: "UNAUTHORIZED" });

    const now = new Date();
    const expiresAt = new Date(now.getTime() + telegramCodeTtlMs);
    const code = createTelegramCode();

    await db.transaction(async (transaction) => {
      await transaction.delete(telegramLinkCodes).where(eq(telegramLinkCodes.userId, userId)).run();
      await transaction
        .insert(telegramLinkCodes)
        .values({
          codeHash: hashTelegramCode(code),
          userId,
          expiresAt,
          createdAt: now,
        })
        .run();
    });

    return reply.code(201).send({
      code,
      expiresAt: expiresAt.toISOString(),
    } satisfies TelegramLinkCodeResponse);
  });

  app.post("/auth/telegram-link", async (request, reply) => {
    if (!telegramInternalSecret) {
      return reply.code(503).send({ error: "TELEGRAM_LINKING_NOT_CONFIGURED" });
    }

    const internalSecret = getHeaderValue(request.headers["x-telegram-internal-secret"]);
    if (!hasValidInternalSecret(internalSecret, telegramInternalSecret)) {
      return reply.code(401).send({ error: "UNAUTHORIZED" });
    }

    const body = request.body as Record<string, unknown> | undefined;
    const parsed = telegramLinkRequestSchema.safeParse({
      ...body,
      code: typeof body?.code === "string" ? body.code.trim().toUpperCase() : body?.code,
    });
    if (!parsed.success) {
      return reply.code(400).send({ error: "VALIDATION_ERROR", details: parsed.error.flatten() });
    }

    const now = new Date();
    const result = await db.transaction(async (transaction) => {
      const [linkCode] = await transaction
        .select({
          userId: telegramLinkCodes.userId,
          expiresAt: telegramLinkCodes.expiresAt,
          consumedAt: telegramLinkCodes.consumedAt,
        })
        .from(telegramLinkCodes)
        .where(eq(telegramLinkCodes.codeHash, hashTelegramCode(parsed.data.code)))
        .limit(1);

      if (!linkCode) return { status: "not_found" as const };
      if (linkCode.consumedAt) return { status: "used" as const };
      if (linkCode.expiresAt.getTime() <= now.getTime()) return { status: "expired" as const };

      const [[telegramOwner], [userTelegramIdentity]] = await Promise.all([
        transaction
          .select({ userId: authIdentities.userId })
          .from(authIdentities)
          .where(
            and(
              eq(authIdentities.provider, "telegram"),
              eq(authIdentities.providerUserId, parsed.data.telegramUserId),
            ),
          )
          .limit(1),
        transaction
          .select({ providerUserId: authIdentities.providerUserId })
          .from(authIdentities)
          .where(
            and(
              eq(authIdentities.provider, "telegram"),
              eq(authIdentities.userId, linkCode.userId),
            ),
          )
          .limit(1),
      ]);

      if (telegramOwner && telegramOwner.userId !== linkCode.userId) {
        return { status: "telegram_taken" as const };
      }
      if (
        userTelegramIdentity &&
        userTelegramIdentity.providerUserId !== parsed.data.telegramUserId
      ) {
        return { status: "user_already_linked" as const };
      }

      if (!telegramOwner && !userTelegramIdentity) {
        await transaction
          .insert(authIdentities)
          .values({
            id: randomUUID(),
            userId: linkCode.userId,
            provider: "telegram",
            providerUserId: parsed.data.telegramUserId,
            createdAt: now,
          })
          .run();
      }

      await transaction
        .update(notificationSettings)
        .set({ channel: "telegram" })
        .where(eq(notificationSettings.userId, linkCode.userId))
        .run();
      await transaction
        .update(telegramLinkCodes)
        .set({ consumedAt: now })
        .where(eq(telegramLinkCodes.codeHash, hashTelegramCode(parsed.data.code)))
        .run();

      return { status: "linked" as const, userId: linkCode.userId };
    });

    if (result.status === "not_found") {
      return reply.code(404).send({ error: "LINK_CODE_NOT_FOUND" });
    }
    if (result.status === "used") {
      return reply.code(410).send({ error: "LINK_CODE_USED" });
    }
    if (result.status === "expired") {
      return reply.code(410).send({ error: "LINK_CODE_EXPIRED" });
    }
    if (result.status === "telegram_taken") {
      return reply.code(409).send({ error: "TELEGRAM_ALREADY_LINKED" });
    }
    if (result.status === "user_already_linked") {
      return reply.code(409).send({ error: "USER_TELEGRAM_ALREADY_LINKED" });
    }

    return reply.send({
      linked: true,
      userId: result.userId,
      telegramUserId: parsed.data.telegramUserId,
    } satisfies TelegramLinkResponse);
  });
}
