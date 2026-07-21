import {
  createPracticeSessionRequestSchema,
  type LearningProgressStatus,
  type Topic,
} from "@mentor/shared";
import { and, asc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";

import { toPublicContentItem } from "../content/public-item.js";
import type { AppDatabase } from "../db/database.js";
import {
  authIdentities,
  contentItems,
  studySessionItems,
  studySessions,
  userContentState,
  users,
} from "../db/schema.js";
import { createPracticeSessionForUser } from "../services/practice.js";

const topics: Topic[] = ["javascript", "typescript", "react", "browser", "node", "css"];

function getHeaderToken(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function progressStatus(
  dueAt: Date | null,
  lastReviewedAt: Date | null,
  streak: number,
  now: Date,
): LearningProgressStatus {
  if (!lastReviewedAt) return "new";
  if (dueAt && dueAt <= now) return "due";
  if (streak >= 3) return "mastered";
  return "learning";
}

async function findIdentity(db: AppDatabase, guestToken: string) {
  const [identity] = await db
    .select({ userId: users.id, timezone: users.timezone })
    .from(authIdentities)
    .innerJoin(users, eq(authIdentities.userId, users.id))
    .where(and(eq(authIdentities.provider, "guest"), eq(authIdentities.providerUserId, guestToken)))
    .limit(1);
  return identity;
}

export function registerLearningRoutes(app: FastifyInstance, db: AppDatabase) {
  app.get("/learning", async (request, reply) => {
    const guestToken = getHeaderToken(request.headers["x-guest-token"]);
    if (!guestToken) return reply.code(401).send({ error: "UNAUTHORIZED" });

    const identity = await findIdentity(db, guestToken);
    if (!identity) return reply.code(401).send({ error: "UNAUTHORIZED" });

    const rows = await db
      .select({
        payload: contentItems.payload,
        dueAt: userContentState.dueAt,
        streak: userContentState.streak,
        lastReviewedAt: userContentState.lastReviewedAt,
      })
      .from(contentItems)
      .leftJoin(
        userContentState,
        and(
          eq(userContentState.contentId, contentItems.id),
          eq(userContentState.userId, identity.userId),
        ),
      )
      .orderBy(asc(contentItems.ordinal));

    const now = new Date();
    const items = rows.map((row) => ({
      id: row.payload.id,
      topic: row.payload.topic,
      subtopic: row.payload.subtopic,
      difficulty: row.payload.difficulty,
      type: row.payload.type,
      tags: row.payload.tags,
      prompt: row.payload.prompt,
      estimatedSeconds: row.payload.estimatedSeconds,
      progressStatus: progressStatus(row.dueAt, row.lastReviewedAt, row.streak ?? 0, now),
      streak: row.streak ?? 0,
      lastReviewedAt: row.lastReviewedAt?.toISOString() ?? null,
      dueAt: row.dueAt?.toISOString() ?? null,
    }));

    const topicSummaries = topics.map((topic) => {
      const topicItems = items.filter((item) => item.topic === topic);
      return {
        topic,
        total: topicItems.length,
        seen: topicItems.filter((item) => item.progressStatus !== "new").length,
        mastered: topicItems.filter((item) => item.progressStatus === "mastered").length,
        due: topicItems.filter((item) => item.progressStatus === "due").length,
        estimatedMinutes: Math.ceil(
          topicItems.reduce((sum, item) => sum + item.estimatedSeconds, 0) / 60,
        ),
      };
    });

    return reply.send({
      summary: {
        total: items.length,
        seen: items.filter((item) => item.progressStatus !== "new").length,
        mastered: items.filter((item) => item.progressStatus === "mastered").length,
        due: items.filter((item) => item.progressStatus === "due").length,
      },
      topics: topicSummaries,
      items,
    });
  });

  app.post("/study/practice", async (request, reply) => {
    const guestToken = getHeaderToken(request.headers["x-guest-token"]);
    if (!guestToken) return reply.code(401).send({ error: "UNAUTHORIZED" });

    const identity = await findIdentity(db, guestToken);
    if (!identity) return reply.code(401).send({ error: "UNAUTHORIZED" });

    const parsed = createPracticeSessionRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: "VALIDATION_ERROR", details: parsed.error.flatten() });
    }

    const session = await createPracticeSessionForUser(db, {
      userId: identity.userId,
      timezone: identity.timezone,
      contentIds: parsed.data.contentIds,
    });
    if (!session) return reply.code(404).send({ error: "CONTENT_NOT_FOUND" });
    return reply.code(201).send(session);
  });

  app.get<{ Params: { sessionId: string } }>(
    "/study/practice/:sessionId",
    async (request, reply) => {
      const guestToken = getHeaderToken(request.headers["x-guest-token"]);
      if (!guestToken) return reply.code(401).send({ error: "UNAUTHORIZED" });

      const identity = await findIdentity(db, guestToken);
      if (!identity) return reply.code(401).send({ error: "UNAUTHORIZED" });

      const [session] = await db
        .select()
        .from(studySessions)
        .where(
          and(
            eq(studySessions.id, request.params.sessionId),
            eq(studySessions.userId, identity.userId),
            eq(studySessions.kind, "mock"),
          ),
        )
        .limit(1);
      if (!session) return reply.code(404).send({ error: "PRACTICE_SESSION_NOT_FOUND" });

      const items = await db
        .select({
          status: studySessionItems.status,
          payload: contentItems.payload,
        })
        .from(studySessionItems)
        .innerJoin(contentItems, eq(studySessionItems.contentId, contentItems.id))
        .where(eq(studySessionItems.sessionId, session.id))
        .orderBy(asc(studySessionItems.position));

      return reply.send({
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
      });
    },
  );
}
