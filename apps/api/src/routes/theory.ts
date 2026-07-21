import { theoryArticles } from "@mentor/content";
import {
  updateTheoryStateRequestSchema,
  type TheoryProgressStatus,
  type TheoryUserState,
} from "@mentor/shared";
import { and, eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";

import type { AppDatabase } from "../db/database.js";
import { authIdentities, userTheoryState } from "../db/schema.js";

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

async function guestUserId(db: AppDatabase, guestToken: string): Promise<string | null> {
  const [identity] = await db
    .select({ userId: authIdentities.userId })
    .from(authIdentities)
    .where(and(eq(authIdentities.provider, "guest"), eq(authIdentities.providerUserId, guestToken)))
    .limit(1);
  return identity?.userId ?? null;
}

function publicTheoryState(
  articleId: string,
  state?: typeof userTheoryState.$inferSelect,
): TheoryUserState {
  return {
    articleId,
    status: state?.status ?? "new",
    bookmarked: state?.bookmarked ?? false,
    lastOpenedAt: state?.lastOpenedAt.toISOString() ?? null,
    completedAt: state?.completedAt?.toISOString() ?? null,
  };
}

export function registerTheoryRoutes(app: FastifyInstance, db: AppDatabase): void {
  app.get("/theory", async (request, reply) => {
    const guestToken = firstHeader(request.headers["x-guest-token"]);
    if (!guestToken) return reply.code(401).send({ error: "UNAUTHORIZED" });
    const userId = await guestUserId(db, guestToken);
    if (!userId) return reply.code(401).send({ error: "UNAUTHORIZED" });

    const rows = await db.select().from(userTheoryState).where(eq(userTheoryState.userId, userId));
    const stateByArticleId = new Map(rows.map((row) => [row.articleId, row]));
    const items = theoryArticles.map((article) => ({
      id: article.id,
      topic: article.topic,
      slug: article.slug,
      title: article.title,
      summary: article.summary,
      estimatedMinutes: article.estimatedMinutes,
      state: publicTheoryState(article.id, stateByArticleId.get(article.id)),
    }));
    const completed = items.filter((item) => item.state.status === "completed").length;

    return reply.send({
      total: theoryArticles.length,
      summary: {
        started: items.filter((item) => item.state.status !== "new").length,
        completed,
        completionPercent: Math.round((completed / theoryArticles.length) * 100),
        bookmarked: items.filter((item) => item.state.bookmarked).length,
      },
      items,
    });
  });

  app.get<{ Params: { articleId: string } }>("/theory/:articleId", async (request, reply) => {
    const guestToken = firstHeader(request.headers["x-guest-token"]);
    if (!guestToken) return reply.code(401).send({ error: "UNAUTHORIZED" });
    const userId = await guestUserId(db, guestToken);
    if (!userId) return reply.code(401).send({ error: "UNAUTHORIZED" });

    const article = theoryArticles.find((candidate) => candidate.id === request.params.articleId);
    if (!article) return reply.code(404).send({ error: "THEORY_ARTICLE_NOT_FOUND" });
    const [state] = await db
      .select()
      .from(userTheoryState)
      .where(and(eq(userTheoryState.userId, userId), eq(userTheoryState.articleId, article.id)))
      .limit(1);
    return reply.send({ ...article, state: publicTheoryState(article.id, state) });
  });

  app.put<{ Params: { articleId: string } }>("/theory/:articleId/state", async (request, reply) => {
    const guestToken = firstHeader(request.headers["x-guest-token"]);
    if (!guestToken) return reply.code(401).send({ error: "UNAUTHORIZED" });
    const userId = await guestUserId(db, guestToken);
    if (!userId) return reply.code(401).send({ error: "UNAUTHORIZED" });

    const article = theoryArticles.find((candidate) => candidate.id === request.params.articleId);
    if (!article) return reply.code(404).send({ error: "THEORY_ARTICLE_NOT_FOUND" });
    const parsed = updateTheoryStateRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: "VALIDATION_ERROR", details: parsed.error.flatten() });
    }

    const now = new Date();
    const requestedStatus = parsed.data.status;
    const update = {
      lastOpenedAt: now,
      ...(parsed.data.bookmarked !== undefined ? { bookmarked: parsed.data.bookmarked } : {}),
      ...(requestedStatus === "completed"
        ? {
            status: "completed" as const,
            completedAt: sql`COALESCE(${userTheoryState.completedAt}, ${now.getTime()})`,
          }
        : requestedStatus === "reading"
          ? {
              status: sql<Exclude<TheoryProgressStatus, "new">>`CASE
                  WHEN ${userTheoryState.status} = 'completed' THEN 'completed'
                  ELSE 'reading'
                END`,
            }
          : {}),
    };

    await db
      .insert(userTheoryState)
      .values({
        userId,
        articleId: article.id,
        status: requestedStatus ?? "reading",
        bookmarked: parsed.data.bookmarked ?? false,
        lastOpenedAt: now,
        completedAt: requestedStatus === "completed" ? now : null,
      })
      .onConflictDoUpdate({
        target: [userTheoryState.userId, userTheoryState.articleId],
        set: update,
      })
      .run();

    const [saved] = await db
      .select()
      .from(userTheoryState)
      .where(and(eq(userTheoryState.userId, userId), eq(userTheoryState.articleId, article.id)))
      .limit(1);
    return reply.send(publicTheoryState(article.id, saved));
  });
}
