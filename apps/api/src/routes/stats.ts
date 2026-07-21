import { topicSchema, type StatsResponse, type Topic } from "@mentor/shared";
import { and, asc, eq, isNotNull } from "drizzle-orm";
import type { FastifyInstance } from "fastify";

import type { AppDatabase } from "../db/database.js";
import {
  answers,
  authIdentities,
  contentItems,
  studySessions,
  userContentState,
  userTopicPreferences,
  users,
} from "../db/schema.js";

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

function shiftDate(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function calculateStreak(completedDates: Set<string>, today: string): number {
  let cursor = completedDates.has(today) ? today : shiftDate(today, -1);
  let streak = 0;
  while (completedDates.has(cursor)) {
    streak += 1;
    cursor = shiftDate(cursor, -1);
  }
  return streak;
}

function accuracy(correct: number, attempts: number): number | null {
  return attempts ? Math.round((correct / attempts) * 100) : null;
}

export function registerStatsRoutes(app: FastifyInstance, db: AppDatabase) {
  app.get("/stats", async (request, reply) => {
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

    const [answerRows, stateRows, sessionRows, topicRows] = await Promise.all([
      db
        .select({
          topic: contentItems.topic,
          isCorrect: answers.isCorrect,
          latencyMs: answers.latencyMs,
          localDate: studySessions.localDate,
        })
        .from(answers)
        .innerJoin(contentItems, eq(answers.contentId, contentItems.id))
        .innerJoin(studySessions, eq(answers.sessionId, studySessions.id))
        .where(eq(answers.userId, user.id)),
      db
        .select({ topic: contentItems.topic, dueAt: userContentState.dueAt })
        .from(userContentState)
        .innerJoin(contentItems, eq(userContentState.contentId, contentItems.id))
        .where(and(eq(userContentState.userId, user.id), isNotNull(userContentState.dueAt)))
        .orderBy(asc(userContentState.dueAt)),
      db
        .select({ localDate: studySessions.localDate, status: studySessions.status })
        .from(studySessions)
        .where(and(eq(studySessions.userId, user.id), eq(studySessions.kind, "daily"))),
      db
        .select({ topic: userTopicPreferences.topic })
        .from(userTopicPreferences)
        .where(eq(userTopicPreferences.userId, user.id)),
    ]);

    const selectedSet = new Set(topicRows.map((row) => row.topic));
    const selectedTopics = topicRows.length
      ? topicSchema.options.filter((topic) => selectedSet.has(topic))
      : [...topicSchema.options];
    const now = new Date();
    const today = localDate(now, user.timezone);
    const completedDates = new Set(
      sessionRows.filter((row) => row.status === "completed").map((row) => row.localDate),
    );
    const objectiveRows = answerRows.filter((row) => row.isCorrect !== null);
    const correctAnswers = objectiveRows.filter((row) => row.isCorrect).length;
    const dueRows = stateRows.filter((row) => row.dueAt && row.dueAt <= now);

    const topics = selectedTopics.map((topic: Topic) => {
      const topicAnswers = answerRows.filter((row) => row.topic === topic);
      const objectiveAnswers = topicAnswers.filter((row) => row.isCorrect !== null);
      const correct = objectiveAnswers.filter((row) => row.isCorrect).length;
      const latencies = topicAnswers.flatMap((row) =>
        row.latencyMs === null ? [] : [row.latencyMs],
      );
      return {
        topic,
        attempts: topicAnswers.length,
        objectiveAttempts: objectiveAnswers.length,
        correctAnswers: correct,
        accuracy: accuracy(correct, objectiveAnswers.length),
        dueReviews: dueRows.filter((row) => row.topic === topic).length,
        averageLatencyMs: latencies.length
          ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length)
          : null,
      };
    });

    const activityDates = Array.from({ length: 7 }, (_, index) => shiftDate(today, index - 6));
    const response = {
      summary: {
        totalAnswers: answerRows.length,
        objectiveAnswers: objectiveRows.length,
        correctAnswers,
        accuracy: accuracy(correctAnswers, objectiveRows.length),
        completedSessions: completedDates.size,
        currentStreak: calculateStreak(completedDates, today),
        dueReviews: dueRows.length,
        nextReviewAt: stateRows[0]?.dueAt?.toISOString() ?? null,
      },
      topics,
      activity: activityDates.map((date) => ({
        localDate: date,
        answers: answerRows.filter((row) => row.localDate === date).length,
        completed: completedDates.has(date),
      })),
    } satisfies StatsResponse;

    return reply.send(response);
  });
}
