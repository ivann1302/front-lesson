import { describe, expect, it } from "vitest";

import {
  advanceMockInterviewRequestSchema,
  contentItemSchema,
  mockInterviewHistoryResponseSchema,
  mockInterviewReportResponseSchema,
  revealMockInterviewRequestSchema,
  submitAnswerRequestSchema,
  updateTheoryStateRequestSchema,
  updateSettingsRequestSchema,
  validateContentCollection,
} from "./index";

const validItem = {
  id: "js-array-map-001",
  version: 1,
  type: "single_choice" as const,
  topic: "javascript" as const,
  subtopic: "array-methods",
  difficulty: "middle" as const,
  tags: ["array", "immutability"],
  prompt: "Что произойдёт с исходным массивом?",
  options: [
    { id: "a", text: "Он не изменится" },
    { id: "b", text: "Он будет изменён" },
  ],
  correctOptionIds: ["a"],
  explanation: "Метод map создаёт новый массив и не изменяет исходный массив.",
  estimatedSeconds: 45,
};

describe("contentItemSchema", () => {
  it("accepts a valid single-choice item", () => {
    expect(contentItemSchema.parse(validItem)).toMatchObject({ id: validItem.id });
  });

  it("rejects a missing correct option", () => {
    const result = contentItemSchema.safeParse({ ...validItem, correctOptionIds: ["missing"] });
    expect(result.success).toBe(false);
  });

  it("rejects duplicated tags and unbalanced markdown fences", () => {
    const result = contentItemSchema.safeParse({
      ...validItem,
      tags: ["array", "array"],
      prompt: "Что выведет код? ```js",
    });
    expect(result.success).toBe(false);
  });
});

describe("submitAnswerRequestSchema", () => {
  it("accepts a stable client answer id", () => {
    expect(
      submitAnswerRequestSchema.safeParse({
        clientAnswerId: "5f2ca37f-218b-49de-910b-8c2bb0207d3c",
        sessionId: "ef8d31d4-41f2-42ae-8e66-c6376e0425e6",
        contentId: validItem.id,
        answer: { kind: "selection", selectedOptionIds: ["a"] },
      }).success,
    ).toBe(true);
  });

  it("rejects duplicate selected options", () => {
    expect(
      submitAnswerRequestSchema.safeParse({
        clientAnswerId: "5f2ca37f-218b-49de-910b-8c2bb0207d3c",
        sessionId: "ef8d31d4-41f2-42ae-8e66-c6376e0425e6",
        contentId: validItem.id,
        answer: { kind: "selection", selectedOptionIds: ["a", "a"] },
      }).success,
    ).toBe(false);
  });
});

describe("updateSettingsRequestSchema", () => {
  it("accepts a complete onboarding selection", () => {
    expect(
      updateSettingsRequestSchema.safeParse({
        topics: ["javascript", "react"],
        dailyLimit: 3,
        localTime: "19:30",
        timezone: "Europe/Moscow",
      }).success,
    ).toBe(true);
  });

  it("rejects duplicate topics and malformed local time", () => {
    expect(
      updateSettingsRequestSchema.safeParse({
        topics: ["react", "react"],
        dailyLimit: 3,
        localTime: "7:30",
        timezone: "Europe/Moscow",
      }).success,
    ).toBe(false);
  });
});

describe("updateTheoryStateRequestSchema", () => {
  it("accepts idempotent progress and bookmark updates", () => {
    expect(
      updateTheoryStateRequestSchema.safeParse({ status: "completed", bookmarked: true }).success,
    ).toBe(true);
    expect(updateTheoryStateRequestSchema.safeParse({ bookmarked: false }).success).toBe(true);
  });

  it("rejects empty, reset and unknown updates", () => {
    expect(updateTheoryStateRequestSchema.safeParse({}).success).toBe(false);
    expect(updateTheoryStateRequestSchema.safeParse({ status: "new" }).success).toBe(false);
    expect(
      updateTheoryStateRequestSchema.safeParse({ status: "reading", extra: true }).success,
    ).toBe(false);
  });
});

describe("mock interview assessment schemas", () => {
  it("accepts saved notes and a valid self-assessment", () => {
    expect(
      revealMockInterviewRequestSchema.parse({
        questionId: "miq-react-reconciliation-001",
        notes: "  Стабильный key сохраняет соответствие элементов.  ",
      }),
    ).toEqual({
      questionId: "miq-react-reconciliation-001",
      notes: "Стабильный key сохраняет соответствие элементов.",
    });
    expect(
      advanceMockInterviewRequestSchema.safeParse({
        questionId: "miq-react-reconciliation-001",
        rating: "hard",
      }).success,
    ).toBe(true);
  });

  it("requires a rating and limits the notes payload", () => {
    expect(
      advanceMockInterviewRequestSchema.safeParse({
        questionId: "miq-react-reconciliation-001",
      }).success,
    ).toBe(false);
    expect(
      revealMockInterviewRequestSchema.safeParse({
        questionId: "miq-react-reconciliation-001",
        notes: "x".repeat(5_001),
      }).success,
    ).toBe(false);
    expect(
      revealMockInterviewRequestSchema.safeParse({
        questionId: "miq-react-reconciliation-001",
        notes: "Короткий ответ",
        referencePoints: ["Нельзя присылать с клиента"],
      }).success,
    ).toBe(false);
  });

  it("validates a completed interview report without internal review links", () => {
    const session = {
      id: "47f982ed-1144-4077-94b4-bce116bfd5af",
      setId: "mock-react",
      title: "React",
      completionReason: "manual",
      durationMinutes: 15,
      total: 5,
      assessedQuestions: 1,
      weakQuestions: 1,
      startedAt: "2026-07-17T10:00:00.000Z",
      completedAt: "2026-07-17T10:05:00.000Z",
    };
    expect(
      mockInterviewReportResponseSchema.safeParse({
        session,
        questions: [
          {
            id: "miq-react-reconciliation-001",
            prompt: "Почему стабильный key важен для reconciliation в React?",
            tags: ["react", "keys"],
            position: 1,
            notes: "Key хранит идентичность элемента.",
            rating: "hard",
            scheduledForReview: true,
            referencePoints: ["Key сопоставляет элементы между рендерами."],
            assessedAt: "2026-07-17T10:04:00.000Z",
          },
        ],
      }).success,
    ).toBe(true);
    const sanitized = mockInterviewReportResponseSchema.parse({
      session,
      questions: [
        {
          id: "miq-react-reconciliation-001",
          prompt: "Почему стабильный key важен для reconciliation в React?",
          tags: ["react", "keys"],
          position: 1,
          notes: "",
          rating: "hard",
          scheduledForReview: true,
          referencePoints: [],
          assessedAt: null,
          relatedContentIds: ["react-list-keys-002"],
        },
      ],
    });
    expect(sanitized.questions[0]).not.toHaveProperty("relatedContentIds");
    expect(
      mockInterviewHistoryResponseSchema.safeParse({
        sessions: [session],
        analytics: {
          summary: {
            sessions: 1,
            assessedQuestions: 1,
            weakQuestions: 1,
            confidencePercent: 0,
          },
          trend: [
            {
              sessionId: session.id,
              title: session.title,
              completedAt: session.completedAt,
              assessedQuestions: 1,
              weakQuestions: 1,
              confidencePercent: 0,
            },
          ],
          weakTopics: [{ tag: "reconciliation", count: 1 }],
        },
      }).success,
    ).toBe(true);
  });
});

describe("validateContentCollection", () => {
  it("rejects duplicated content ids", () => {
    expect(() => validateContentCollection([validItem, validItem])).toThrow(/Дублирующийся id/);
  });

  it("rejects links to missing content", () => {
    expect(() =>
      validateContentCollection([{ ...validItem, relatedIds: ["js-missing-item-999"] }]),
    ).toThrow(/Некорректная связь/);
  });
});
