import { randomUUID } from "node:crypto";

import { mockInterviewCatalog } from "@mentor/content";
import {
  advanceMockInterviewRequestSchema,
  revealMockInterviewRequestSchema,
  startMockInterviewRequestSchema,
  type MockInterviewAnalytics,
  type MockInterviewHistoryItem,
  type MockInterviewReportResponse,
  type MockInterviewSessionResponse,
} from "@mentor/shared";
import { and, desc, eq, inArray, isNull, lte } from "drizzle-orm";
import type { FastifyInstance } from "fastify";

import type { AppDatabase } from "../db/database.js";
import {
  authIdentities,
  mockInterviewQuestionAssessments,
  mockInterviewSessions,
  userContentState,
  users,
} from "../db/schema.js";
import { getHeaderValue } from "../security/internal-secret.js";
import { createPracticeSessionForUser } from "../services/practice.js";
import { calculateReview } from "../services/review.js";

type SessionRow = typeof mockInterviewSessions.$inferSelect;
type AssessmentRow = typeof mockInterviewQuestionAssessments.$inferSelect;

const setById = new Map(mockInterviewCatalog.sets.map((set) => [set.id, set]));
const questionById = new Map(
  mockInterviewCatalog.questions.map((question) => [question.id, question]),
);

async function findGuestUserId(db: AppDatabase, guestToken: string): Promise<string | undefined> {
  const [identity] = await db
    .select({ userId: authIdentities.userId })
    .from(authIdentities)
    .where(and(eq(authIdentities.provider, "guest"), eq(authIdentities.providerUserId, guestToken)))
    .limit(1);
  return identity?.userId;
}

async function findGuestUser(db: AppDatabase, guestToken: string) {
  const [user] = await db
    .select({ id: users.id, timezone: users.timezone })
    .from(authIdentities)
    .innerJoin(users, eq(authIdentities.userId, users.id))
    .where(and(eq(authIdentities.provider, "guest"), eq(authIdentities.providerUserId, guestToken)))
    .limit(1);
  return user;
}

async function readOwnedSession(
  db: AppDatabase,
  sessionId: string,
  userId: string,
): Promise<SessionRow | undefined> {
  const [session] = await db
    .select()
    .from(mockInterviewSessions)
    .where(and(eq(mockInterviewSessions.id, sessionId), eq(mockInterviewSessions.userId, userId)))
    .limit(1);
  return session;
}

async function applyTimeout(db: AppDatabase, session: SessionRow, now: Date): Promise<SessionRow> {
  if (session.status !== "active" || session.endsAt > now) return session;
  await db
    .update(mockInterviewSessions)
    .set({ status: "completed", completionReason: "timeout", completedAt: now })
    .where(
      and(eq(mockInterviewSessions.id, session.id), eq(mockInterviewSessions.status, "active")),
    )
    .run();
  return {
    ...session,
    status: "completed",
    completionReason: "timeout",
    completedAt: now,
  };
}

async function sessionResponse(
  db: AppDatabase,
  session: SessionRow,
): Promise<MockInterviewSessionResponse> {
  const set = setById.get(session.setId);
  if (!set) throw new Error(`Unknown mock interview set ${session.setId}`);
  const assessments = await db
    .select()
    .from(mockInterviewQuestionAssessments)
    .where(eq(mockInterviewQuestionAssessments.sessionId, session.id));
  const questionId =
    session.status === "active" ? set.questionIds[session.currentQuestionIndex] : undefined;
  const question = questionId ? questionById.get(questionId) : undefined;
  const assessment = questionId
    ? assessments.find((candidate) => candidate.questionId === questionId)
    : undefined;

  return {
    session: {
      id: session.id,
      setId: set.id,
      title: set.title,
      status: session.status,
      completionReason: session.completionReason,
      durationMinutes: session.durationMinutes as 15 | 30 | 45,
      currentQuestionIndex: session.currentQuestionIndex,
      total: set.questionIds.length,
      assessedQuestions: assessments.filter((candidate) => candidate.rating !== null).length,
      weakQuestions: assessments.filter(
        (candidate) => candidate.rating === "again" || candidate.rating === "hard",
      ).length,
      startedAt: session.startedAt.toISOString(),
      endsAt: session.endsAt.toISOString(),
      completedAt: session.completedAt?.toISOString() ?? null,
    },
    question: question
      ? {
          id: question.id,
          prompt: question.prompt,
          tags: question.tags,
          estimatedSeconds: question.estimatedSeconds,
          position: session.currentQuestionIndex + 1,
          total: set.questionIds.length,
          notes: assessment?.notes ?? "",
          revealed: assessment !== undefined,
          ...(assessment ? { referencePoints: question.referencePoints } : {}),
        }
      : null,
  };
}

function historyItem(session: SessionRow, assessments: AssessmentRow[]): MockInterviewHistoryItem {
  const set = setById.get(session.setId);
  if (!set) throw new Error(`Unknown mock interview set ${session.setId}`);
  if (session.status !== "completed" || !session.completionReason || !session.completedAt) {
    throw new Error(`Mock interview session ${session.id} is not completed`);
  }
  return {
    id: session.id,
    setId: set.id,
    title: set.title,
    completionReason: session.completionReason,
    durationMinutes: session.durationMinutes as 15 | 30 | 45,
    total: set.questionIds.length,
    assessedQuestions: assessments.filter((assessment) => assessment.rating !== null).length,
    weakQuestions: assessments.filter(
      (assessment) => assessment.rating === "again" || assessment.rating === "hard",
    ).length,
    startedAt: session.startedAt.toISOString(),
    completedAt: session.completedAt.toISOString(),
  };
}

function confidencePercent(assessments: AssessmentRow[]): number | null {
  const assessed = assessments.filter((assessment) => assessment.rating !== null);
  if (assessed.length === 0) return null;
  const weak = assessed.filter(
    (assessment) => assessment.rating === "again" || assessment.rating === "hard",
  ).length;
  return Math.round(((assessed.length - weak) / assessed.length) * 100);
}

function interviewAnalytics(
  sessions: SessionRow[],
  assessmentsBySessionId: Map<string, AssessmentRow[]>,
): MockInterviewAnalytics {
  const assessments = sessions.flatMap((session) => assessmentsBySessionId.get(session.id) ?? []);
  const assessedQuestions = assessments.filter((assessment) => assessment.rating !== null).length;
  const weakAssessments = assessments.filter(
    (assessment) => assessment.rating === "again" || assessment.rating === "hard",
  );
  const weakTagCounts = new Map<string, number>();
  for (const assessment of weakAssessments) {
    const question = questionById.get(assessment.questionId);
    if (!question) continue;
    for (const tag of question.tags) {
      weakTagCounts.set(tag, (weakTagCounts.get(tag) ?? 0) + 1);
    }
  }

  return {
    summary: {
      sessions: sessions.length,
      assessedQuestions,
      weakQuestions: weakAssessments.length,
      confidencePercent: confidencePercent(assessments),
    },
    trend: sessions
      .slice(0, 8)
      .reverse()
      .map((session) => {
        const sessionAssessments = assessmentsBySessionId.get(session.id) ?? [];
        const item = historyItem(session, sessionAssessments);
        return {
          sessionId: session.id,
          title: item.title,
          completedAt: item.completedAt,
          assessedQuestions: item.assessedQuestions,
          weakQuestions: item.weakQuestions,
          confidencePercent: confidencePercent(sessionAssessments),
        };
      }),
    weakTopics: [...weakTagCounts.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((left, right) => right.count - left.count || left.tag.localeCompare(right.tag))
      .slice(0, 6),
  };
}

export function registerMockInterviewRoutes(app: FastifyInstance, db: AppDatabase) {
  app.get("/mock-interviews", async (request, reply) => {
    const guestToken = getHeaderValue(request.headers["x-guest-token"]);
    if (!guestToken || !(await findGuestUserId(db, guestToken))) {
      return reply.code(401).send({ error: "UNAUTHORIZED" });
    }

    return reply.send({
      sets: mockInterviewCatalog.sets.map((set) => ({
        id: set.id,
        track: set.track,
        title: set.title,
        description: set.description,
        recommendedDurationMinutes: set.recommendedDurationMinutes,
        questionCount: set.questionIds.length,
      })),
    });
  });

  app.post("/mock-interviews/sessions", async (request, reply) => {
    const guestToken = getHeaderValue(request.headers["x-guest-token"]);
    if (!guestToken) return reply.code(401).send({ error: "UNAUTHORIZED" });
    const userId = await findGuestUserId(db, guestToken);
    if (!userId) return reply.code(401).send({ error: "UNAUTHORIZED" });

    const parsed = startMockInterviewRequestSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: "VALIDATION_ERROR", details: parsed.error.flatten() });
    }
    const set = setById.get(parsed.data.setId);
    if (!set) return reply.code(404).send({ error: "MOCK_INTERVIEW_SET_NOT_FOUND" });

    const now = new Date();
    const session: SessionRow = {
      id: randomUUID(),
      userId,
      setId: set.id,
      durationMinutes: parsed.data.durationMinutes,
      currentQuestionIndex: 0,
      status: "active",
      completionReason: null,
      startedAt: now,
      endsAt: new Date(now.getTime() + parsed.data.durationMinutes * 60_000),
      completedAt: null,
    };
    await db.insert(mockInterviewSessions).values(session).run();
    return reply.code(201).send(await sessionResponse(db, session));
  });

  app.get("/mock-interviews/history", async (request, reply) => {
    const guestToken = getHeaderValue(request.headers["x-guest-token"]);
    if (!guestToken) return reply.code(401).send({ error: "UNAUTHORIZED" });
    const userId = await findGuestUserId(db, guestToken);
    if (!userId) return reply.code(401).send({ error: "UNAUTHORIZED" });

    const now = new Date();
    await db
      .update(mockInterviewSessions)
      .set({ status: "completed", completionReason: "timeout", completedAt: now })
      .where(
        and(
          eq(mockInterviewSessions.userId, userId),
          eq(mockInterviewSessions.status, "active"),
          lte(mockInterviewSessions.endsAt, now),
        ),
      )
      .run();
    const sessions = await db
      .select()
      .from(mockInterviewSessions)
      .where(
        and(
          eq(mockInterviewSessions.userId, userId),
          eq(mockInterviewSessions.status, "completed"),
        ),
      )
      .orderBy(desc(mockInterviewSessions.completedAt))
      .limit(20);
    const assessments = sessions.length
      ? await db
          .select()
          .from(mockInterviewQuestionAssessments)
          .where(
            inArray(
              mockInterviewQuestionAssessments.sessionId,
              sessions.map((session) => session.id),
            ),
          )
      : [];
    const assessmentsBySessionId = new Map<string, AssessmentRow[]>();
    for (const assessment of assessments) {
      const values = assessmentsBySessionId.get(assessment.sessionId) ?? [];
      values.push(assessment);
      assessmentsBySessionId.set(assessment.sessionId, values);
    }

    return reply.send({
      sessions: sessions.map((session) =>
        historyItem(session, assessmentsBySessionId.get(session.id) ?? []),
      ),
      analytics: interviewAnalytics(sessions, assessmentsBySessionId),
    });
  });

  app.get<{ Params: { sessionId: string } }>(
    "/mock-interviews/sessions/:sessionId/report",
    async (request, reply) => {
      const guestToken = getHeaderValue(request.headers["x-guest-token"]);
      if (!guestToken) return reply.code(401).send({ error: "UNAUTHORIZED" });
      const userId = await findGuestUserId(db, guestToken);
      if (!userId) return reply.code(401).send({ error: "UNAUTHORIZED" });

      const stored = await readOwnedSession(db, request.params.sessionId, userId);
      if (!stored) return reply.code(404).send({ error: "MOCK_INTERVIEW_SESSION_NOT_FOUND" });
      const session = await applyTimeout(db, stored, new Date());
      if (session.status !== "completed") {
        return reply.code(409).send({ error: "MOCK_INTERVIEW_SESSION_ACTIVE" });
      }
      const set = setById.get(session.setId);
      if (!set) return reply.code(500).send({ error: "MOCK_INTERVIEW_SET_NOT_FOUND" });
      const assessments = await db
        .select()
        .from(mockInterviewQuestionAssessments)
        .where(eq(mockInterviewQuestionAssessments.sessionId, session.id));
      const assessmentByQuestionId = new Map(
        assessments.map((assessment) => [assessment.questionId, assessment]),
      );
      const questions: MockInterviewReportResponse["questions"] = [];
      for (const [index, questionId] of set.questionIds.entries()) {
        const assessment = assessmentByQuestionId.get(questionId);
        const question = questionById.get(questionId);
        if (!assessment || !question) continue;
        questions.push({
          id: question.id,
          prompt: question.prompt,
          tags: question.tags,
          position: index + 1,
          notes: assessment.notes,
          rating: assessment.rating,
          scheduledForReview: assessment.rating === "again" || assessment.rating === "hard",
          referencePoints: question.referencePoints,
          assessedAt: assessment.assessedAt?.toISOString() ?? null,
        });
      }

      return reply.send({
        session: historyItem(session, assessments),
        questions,
      } satisfies MockInterviewReportResponse);
    },
  );

  app.post<{ Params: { sessionId: string } }>(
    "/mock-interviews/sessions/:sessionId/practice",
    async (request, reply) => {
      const guestToken = getHeaderValue(request.headers["x-guest-token"]);
      if (!guestToken) return reply.code(401).send({ error: "UNAUTHORIZED" });
      const user = await findGuestUser(db, guestToken);
      if (!user) return reply.code(401).send({ error: "UNAUTHORIZED" });

      const stored = await readOwnedSession(db, request.params.sessionId, user.id);
      if (!stored) return reply.code(404).send({ error: "MOCK_INTERVIEW_SESSION_NOT_FOUND" });
      const session = await applyTimeout(db, stored, new Date());
      if (session.status !== "completed") {
        return reply.code(409).send({ error: "MOCK_INTERVIEW_SESSION_ACTIVE" });
      }
      const set = setById.get(session.setId);
      if (!set) return reply.code(500).send({ error: "MOCK_INTERVIEW_SET_NOT_FOUND" });
      const assessments = await db
        .select({
          questionId: mockInterviewQuestionAssessments.questionId,
          rating: mockInterviewQuestionAssessments.rating,
        })
        .from(mockInterviewQuestionAssessments)
        .where(eq(mockInterviewQuestionAssessments.sessionId, session.id));
      const weakQuestionIds = new Set(
        assessments
          .filter((assessment) => assessment.rating === "again" || assessment.rating === "hard")
          .map((assessment) => assessment.questionId),
      );
      const contentIds: string[] = [];
      const seenContentIds = new Set<string>();
      for (const questionId of set.questionIds) {
        if (!weakQuestionIds.has(questionId)) continue;
        const question = questionById.get(questionId);
        if (!question) continue;
        for (const contentId of question.relatedContentIds) {
          if (seenContentIds.has(contentId)) continue;
          seenContentIds.add(contentId);
          contentIds.push(contentId);
          if (contentIds.length === 10) break;
        }
        if (contentIds.length === 10) break;
      }
      if (contentIds.length === 0) {
        return reply.code(409).send({ error: "MOCK_INTERVIEW_NO_WEAK_TOPICS" });
      }

      const practice = await createPracticeSessionForUser(db, {
        userId: user.id,
        timezone: user.timezone,
        contentIds,
      });
      if (!practice) return reply.code(500).send({ error: "MOCK_INTERVIEW_PRACTICE_FAILED" });
      return reply.code(201).send(practice);
    },
  );

  app.get<{ Params: { sessionId: string } }>(
    "/mock-interviews/sessions/:sessionId",
    async (request, reply) => {
      const guestToken = getHeaderValue(request.headers["x-guest-token"]);
      if (!guestToken) return reply.code(401).send({ error: "UNAUTHORIZED" });
      const userId = await findGuestUserId(db, guestToken);
      if (!userId) return reply.code(401).send({ error: "UNAUTHORIZED" });

      const stored = await readOwnedSession(db, request.params.sessionId, userId);
      if (!stored) return reply.code(404).send({ error: "MOCK_INTERVIEW_SESSION_NOT_FOUND" });
      return reply.send(await sessionResponse(db, await applyTimeout(db, stored, new Date())));
    },
  );

  app.post<{ Params: { sessionId: string } }>(
    "/mock-interviews/sessions/:sessionId/reveal",
    async (request, reply) => {
      const guestToken = getHeaderValue(request.headers["x-guest-token"]);
      if (!guestToken) return reply.code(401).send({ error: "UNAUTHORIZED" });
      const userId = await findGuestUserId(db, guestToken);
      if (!userId) return reply.code(401).send({ error: "UNAUTHORIZED" });
      const parsed = revealMockInterviewRequestSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.code(400).send({ error: "VALIDATION_ERROR", details: parsed.error.flatten() });
      }

      const stored = await readOwnedSession(db, request.params.sessionId, userId);
      if (!stored) return reply.code(404).send({ error: "MOCK_INTERVIEW_SESSION_NOT_FOUND" });
      const session = await applyTimeout(db, stored, new Date());
      if (session.status === "completed") {
        return reply.code(409).send({ error: "MOCK_INTERVIEW_SESSION_COMPLETED" });
      }
      const set = setById.get(session.setId);
      if (!set) return reply.code(500).send({ error: "MOCK_INTERVIEW_SET_NOT_FOUND" });
      if (set.questionIds[session.currentQuestionIndex] !== parsed.data.questionId) {
        return reply.code(409).send({ error: "MOCK_INTERVIEW_QUESTION_MISMATCH" });
      }

      const now = new Date();
      await db
        .insert(mockInterviewQuestionAssessments)
        .values({
          sessionId: session.id,
          questionId: parsed.data.questionId,
          notes: parsed.data.notes,
          revealedAt: now,
          rating: null,
          assessedAt: null,
        })
        .onConflictDoUpdate({
          target: [
            mockInterviewQuestionAssessments.sessionId,
            mockInterviewQuestionAssessments.questionId,
          ],
          set: { notes: parsed.data.notes },
        })
        .run();
      return reply.send(await sessionResponse(db, session));
    },
  );

  app.post<{ Params: { sessionId: string } }>(
    "/mock-interviews/sessions/:sessionId/next",
    async (request, reply) => {
      const guestToken = getHeaderValue(request.headers["x-guest-token"]);
      if (!guestToken) return reply.code(401).send({ error: "UNAUTHORIZED" });
      const userId = await findGuestUserId(db, guestToken);
      if (!userId) return reply.code(401).send({ error: "UNAUTHORIZED" });
      const parsed = advanceMockInterviewRequestSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.code(400).send({ error: "VALIDATION_ERROR", details: parsed.error.flatten() });
      }

      const stored = await readOwnedSession(db, request.params.sessionId, userId);
      if (!stored) return reply.code(404).send({ error: "MOCK_INTERVIEW_SESSION_NOT_FOUND" });
      const session = await applyTimeout(db, stored, new Date());
      if (session.status === "completed") {
        return reply.send(await sessionResponse(db, session));
      }

      const set = setById.get(session.setId);
      if (!set) return reply.code(500).send({ error: "MOCK_INTERVIEW_SET_NOT_FOUND" });
      const expectedQuestionId = set.questionIds[session.currentQuestionIndex];
      if (expectedQuestionId !== parsed.data.questionId) {
        const previousQuestionId = set.questionIds[session.currentQuestionIndex - 1];
        if (previousQuestionId === parsed.data.questionId) {
          return reply.send(await sessionResponse(db, session));
        }
        return reply.code(409).send({ error: "MOCK_INTERVIEW_QUESTION_MISMATCH" });
      }
      const question = questionById.get(expectedQuestionId);
      if (!question) return reply.code(500).send({ error: "MOCK_INTERVIEW_QUESTION_NOT_FOUND" });

      const nextIndex = session.currentQuestionIndex + 1;
      const completed = nextIndex >= set.questionIds.length;
      const now = new Date();
      const transactionResult = await db.transaction(async (transaction) => {
        const rated = await transaction
          .update(mockInterviewQuestionAssessments)
          .set({ rating: parsed.data.rating, assessedAt: now })
          .where(
            and(
              eq(mockInterviewQuestionAssessments.sessionId, session.id),
              eq(mockInterviewQuestionAssessments.questionId, expectedQuestionId),
              isNull(mockInterviewQuestionAssessments.rating),
            ),
          )
          .returning();
        if (!rated[0]) return null;

        if (parsed.data.rating === "again" || parsed.data.rating === "hard") {
          const previousRows = await transaction
            .select({
              contentId: userContentState.contentId,
              intervalDays: userContentState.intervalDays,
              ease: userContentState.ease,
              streak: userContentState.streak,
              lapses: userContentState.lapses,
            })
            .from(userContentState)
            .where(
              and(
                eq(userContentState.userId, userId),
                inArray(userContentState.contentId, question.relatedContentIds),
              ),
            );
          const previousByContentId = new Map(previousRows.map((row) => [row.contentId, row]));
          for (const contentId of question.relatedContentIds) {
            const previous = previousByContentId.get(contentId) ?? null;
            const review = calculateReview(previous, parsed.data.rating, now);
            await transaction
              .insert(userContentState)
              .values({
                userId,
                contentId,
                dueAt: new Date(review.nextDueAt),
                intervalDays: review.intervalDays,
                ease: review.ease,
                streak: review.streak,
                lapses: review.lapses,
                lastReviewedAt: now,
              })
              .onConflictDoUpdate({
                target: [userContentState.userId, userContentState.contentId],
                set: {
                  dueAt: new Date(review.nextDueAt),
                  intervalDays: review.intervalDays,
                  ease: review.ease,
                  streak: review.streak,
                  lapses: review.lapses,
                  lastReviewedAt: now,
                },
              })
              .run();
          }
        }

        const updatedRows = await transaction
          .update(mockInterviewSessions)
          .set({
            currentQuestionIndex: nextIndex,
            ...(completed
              ? {
                  status: "completed" as const,
                  completionReason: "finished" as const,
                  completedAt: now,
                }
              : {}),
          })
          .where(
            and(
              eq(mockInterviewSessions.id, session.id),
              eq(mockInterviewSessions.status, "active"),
              eq(mockInterviewSessions.currentQuestionIndex, session.currentQuestionIndex),
            ),
          )
          .returning();
        return updatedRows[0] ?? null;
      });

      if (!transactionResult) {
        const current = await readOwnedSession(db, session.id, userId);
        if (current && current.currentQuestionIndex > session.currentQuestionIndex) {
          return reply.send(await sessionResponse(db, current));
        }
        return reply.code(409).send({ error: "MOCK_INTERVIEW_REVIEW_REQUIRED" });
      }
      return reply.send(await sessionResponse(db, transactionResult));
    },
  );

  app.post<{ Params: { sessionId: string } }>(
    "/mock-interviews/sessions/:sessionId/complete",
    async (request, reply) => {
      const guestToken = getHeaderValue(request.headers["x-guest-token"]);
      if (!guestToken) return reply.code(401).send({ error: "UNAUTHORIZED" });
      const userId = await findGuestUserId(db, guestToken);
      if (!userId) return reply.code(401).send({ error: "UNAUTHORIZED" });

      const stored = await readOwnedSession(db, request.params.sessionId, userId);
      if (!stored) return reply.code(404).send({ error: "MOCK_INTERVIEW_SESSION_NOT_FOUND" });
      if (stored.status === "completed") {
        return reply.send(await sessionResponse(db, stored));
      }

      const now = new Date();
      const completionReason = stored.endsAt <= now ? "timeout" : "manual";
      await db
        .update(mockInterviewSessions)
        .set({ status: "completed", completionReason, completedAt: now })
        .where(
          and(eq(mockInterviewSessions.id, stored.id), eq(mockInterviewSessions.status, "active")),
        )
        .run();
      return reply.send(
        await sessionResponse(db, {
          ...stored,
          status: "completed",
          completionReason,
          completedAt: now,
        }),
      );
    },
  );
}
