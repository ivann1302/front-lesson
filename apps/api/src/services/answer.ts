import { randomUUID } from "node:crypto";

import type {
  AnswerSubmission,
  ContentItem,
  ReviewRating,
  SubmitAnswerRequest,
} from "@mentor/shared";
import { and, eq } from "drizzle-orm";

import { toAnswerFeedback } from "../content/answer-feedback.js";
import type { AppDatabase } from "../db/database.js";
import {
  answers,
  contentItems,
  studySessionItems,
  studySessions,
  userContentState,
} from "../db/schema.js";
import { calculateReview, type ReviewSnapshot } from "./review.js";

type SessionSnapshot = {
  status: "active" | "completed";
  answered: number;
  total: number;
};

type StoredAnswerPayload = {
  submission: AnswerSubmission;
  rating: ReviewRating;
  review: ReviewSnapshot;
  session: SessionSnapshot;
};

function canonicalSubmission(submission: AnswerSubmission): AnswerSubmission {
  if (submission.kind !== "selection") return submission;
  return { ...submission, selectedOptionIds: [...submission.selectedOptionIds].sort() };
}

function sameSubmission(left: AnswerSubmission, right: AnswerSubmission): boolean {
  return JSON.stringify(canonicalSubmission(left)) === JSON.stringify(canonicalSubmission(right));
}

function equalOptionSets(selected: string[], correct: string[]): boolean {
  if (selected.length !== correct.length) return false;
  const selectedSet = new Set(selected);
  return correct.every((optionId) => selectedSet.has(optionId));
}

function normalizedText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function evaluateAnswer(
  item: ContentItem,
  submission: AnswerSubmission,
): { isCorrect: boolean | null; rating: ReviewRating } | undefined {
  if (item.type === "single_choice" || item.type === "multiple_choice") {
    if (submission.kind !== "selection") return undefined;
    const optionIds = new Set(item.options.map((option) => option.id));
    if (submission.selectedOptionIds.some((optionId) => !optionIds.has(optionId))) return undefined;
    if (item.type === "single_choice" && submission.selectedOptionIds.length !== 1)
      return undefined;

    const isCorrect = equalOptionSets(submission.selectedOptionIds, item.correctOptionIds);
    return { isCorrect, rating: isCorrect ? "good" : "again" };
  }

  if (item.type === "code_output") {
    if (submission.kind !== "text") return undefined;
    const isCorrect = normalizedText(submission.text) === normalizedText(item.answer);
    return { isCorrect, rating: isCorrect ? "good" : "again" };
  }

  if (submission.kind !== "self_assessment") return undefined;
  return { isCorrect: null, rating: submission.rating };
}

function answerResponse(
  row: { id: string; clientAnswerId: string; isCorrect: boolean | null },
  contentId: string,
  item: ContentItem,
  stored: StoredAnswerPayload,
) {
  return {
    answer: {
      id: row.id,
      clientAnswerId: row.clientAnswerId,
      contentId,
      isCorrect: row.isCorrect,
      rating: stored.rating,
    },
    feedback: toAnswerFeedback(item),
    review: stored.review,
    session: stored.session,
  };
}

export async function submitAnswerForUser(
  db: AppDatabase,
  userId: string,
  rawInput: SubmitAnswerRequest,
) {
  const input = { ...rawInput, answer: canonicalSubmission(rawInput.answer) };

  return db.transaction(async (transaction) => {
    const [existing] = await transaction
      .select()
      .from(answers)
      .where(eq(answers.clientAnswerId, input.clientAnswerId))
      .limit(1);

    if (existing) {
      const stored = existing.payload as StoredAnswerPayload;
      if (
        existing.userId !== userId ||
        existing.sessionId !== input.sessionId ||
        existing.contentId !== input.contentId ||
        !sameSubmission(stored.submission, input.answer)
      ) {
        return { error: "IDEMPOTENCY_CONFLICT" as const, statusCode: 409 as const };
      }

      const [item] = await transaction
        .select({ payload: contentItems.payload })
        .from(contentItems)
        .where(eq(contentItems.id, existing.contentId))
        .limit(1);
      if (!item) return { error: "CONTENT_NOT_FOUND" as const, statusCode: 404 as const };

      return {
        response: answerResponse(existing, existing.contentId, item.payload, stored),
        statusCode: 200 as const,
      };
    }

    const [sessionItem] = await transaction
      .select({
        itemStatus: studySessionItems.status,
        sessionStatus: studySessions.status,
        payload: contentItems.payload,
      })
      .from(studySessionItems)
      .innerJoin(studySessions, eq(studySessionItems.sessionId, studySessions.id))
      .innerJoin(contentItems, eq(studySessionItems.contentId, contentItems.id))
      .where(
        and(
          eq(studySessionItems.sessionId, input.sessionId),
          eq(studySessionItems.contentId, input.contentId),
          eq(studySessions.userId, userId),
        ),
      )
      .limit(1);

    if (!sessionItem) return { error: "SESSION_ITEM_NOT_FOUND" as const, statusCode: 404 as const };
    if (sessionItem.itemStatus === "answered") {
      return { error: "ALREADY_ANSWERED" as const, statusCode: 409 as const };
    }
    if (sessionItem.sessionStatus === "completed") {
      return { error: "SESSION_COMPLETED" as const, statusCode: 409 as const };
    }

    const evaluation = evaluateAnswer(sessionItem.payload, input.answer);
    if (!evaluation) return { error: "ANSWER_TYPE_MISMATCH" as const, statusCode: 400 as const };

    const [previous] = await transaction
      .select({
        intervalDays: userContentState.intervalDays,
        ease: userContentState.ease,
        streak: userContentState.streak,
        lapses: userContentState.lapses,
      })
      .from(userContentState)
      .where(
        and(eq(userContentState.userId, userId), eq(userContentState.contentId, input.contentId)),
      )
      .limit(1);

    const now = new Date();
    const review = calculateReview(previous ?? null, evaluation.rating, now);
    const answerId = randomUUID();

    await transaction
      .update(studySessionItems)
      .set({ status: "answered" })
      .where(
        and(
          eq(studySessionItems.sessionId, input.sessionId),
          eq(studySessionItems.contentId, input.contentId),
        ),
      )
      .run();

    const sessionRows = await transaction
      .select({ status: studySessionItems.status })
      .from(studySessionItems)
      .where(eq(studySessionItems.sessionId, input.sessionId));
    const answered = sessionRows.filter((row) => row.status === "answered").length;
    const session: SessionSnapshot = {
      status: answered === sessionRows.length ? "completed" : "active",
      answered,
      total: sessionRows.length,
    };
    const stored: StoredAnswerPayload = {
      submission: input.answer,
      rating: evaluation.rating,
      review,
      session,
    };

    await transaction
      .insert(answers)
      .values({
        id: answerId,
        userId,
        sessionId: input.sessionId,
        contentId: input.contentId,
        clientAnswerId: input.clientAnswerId,
        payload: stored,
        isCorrect: evaluation.isCorrect,
        latencyMs: input.latencyMs,
        createdAt: now,
      })
      .run();
    await transaction
      .insert(userContentState)
      .values({
        userId,
        contentId: input.contentId,
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
    await transaction
      .update(studySessions)
      .set({
        status: session.status,
        completedAt: session.status === "completed" ? now : null,
      })
      .where(eq(studySessions.id, input.sessionId))
      .run();

    return {
      response: answerResponse(
        { id: answerId, clientAnswerId: input.clientAnswerId, isCorrect: evaluation.isCorrect },
        input.contentId,
        sessionItem.payload,
        stored,
      ),
      statusCode: 201 as const,
    };
  });
}
