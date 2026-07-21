import { describe, expect, it } from "vitest";

import {
  contentItems,
  getContentStats,
  getMockInterviewStats,
  getKnowledgeSourceStats,
  getTheoryStats,
  hackFrontendKnowledgeBase,
  mockInterviewCatalog,
  rawContentItems,
  rawMockInterviewCatalog,
  searchKnowledgeSources,
  starterItems,
  theoryArticles,
  validateTheoryContent,
  validateMockInterviewContent,
} from "./index";

describe("content catalog", () => {
  it("contains 60 validated items with ten items per topic", () => {
    const stats = getContentStats(contentItems);
    expect(stats.total).toBe(60);
    expect(Object.values(stats.byTopic)).toEqual([10, 10, 10, 10, 10, 10]);
  });

  it("covers all supported content types", () => {
    expect(Object.keys(getContentStats(contentItems).byType).sort()).toEqual([
      "code_output",
      "find_bug",
      "flashcard",
      "interview_question",
      "multiple_choice",
      "single_choice",
      "term",
    ]);
  });

  it("keeps the web starter queue inside the validated catalog", () => {
    expect(starterItems).toHaveLength(2);
    expect(starterItems.every((item) => item.type === "single_choice")).toBe(true);
    expect(starterItems.every((item) => contentItems.includes(item))).toBe(true);
  });

  it("does not silently drop raw items during validation", () => {
    expect(contentItems).toHaveLength(rawContentItems.length);
  });
});

describe("theory catalog", () => {
  it("contains an original starter chapter for every supported topic", () => {
    expect(getTheoryStats()).toEqual({
      total: 18,
      byTopic: {
        javascript: 3,
        typescript: 3,
        react: 3,
        browser: 3,
        node: 3,
        css: 3,
      },
    });
    expect(
      theoryArticles.every((article) => article.sections.some((section) => section.example)),
    ).toBe(true);
  });

  it("keeps topic sources resolvable and primary references explicit", () => {
    const sourceIds = new Set(hackFrontendKnowledgeBase.items.map((source) => source.id));
    expect(
      theoryArticles.every((article) =>
        article.sourceIds.every((sourceId) => sourceIds.has(sourceId)),
      ),
    ).toBe(true);
    expect(
      theoryArticles.every((article) =>
        article.references.some((reference) => reference.kind === "primary"),
      ),
    ).toBe(true);
  });

  it("links every theory chapter to validated practice with at least one matching topic", () => {
    const topicByContentId = new Map(contentItems.map((item) => [item.id, item.topic]));

    expect(
      theoryArticles.every(
        (article) =>
          article.relatedContentIds.every((contentId) => topicByContentId.has(contentId)) &&
          article.relatedContentIds.some(
            (contentId) => topicByContentId.get(contentId) === article.topic,
          ),
      ),
    ).toBe(true);
  });

  it("rejects theory linked to an unknown external source", () => {
    const invalid = theoryArticles.map((article, index) =>
      index === 0 ? { ...article, sourceIds: ["hackfrontend:javascript/missing"] } : article,
    );
    expect(() => validateTheoryContent(invalid)).toThrow(/отсутствующий источник/);
  });

  it("rejects theory linked to an unknown practice item", () => {
    const invalid = theoryArticles.map((article, index) =>
      index === 0 ? { ...article, relatedContentIds: ["js-missing-item-999"] } : article,
    );
    expect(() => validateTheoryContent(invalid)).toThrow(/отсутствующим заданием/);
  });
});

describe("external knowledge sources", () => {
  it("indexes the public Russian Hack Frontend documentation without copying article bodies", () => {
    const stats = getKnowledgeSourceStats();

    expect(stats.total).toBeGreaterThanOrEqual(200);
    expect(stats.bySection).toMatchObject({
      "html-and-css": expect.any(Number),
      javascript: expect.any(Number),
      typescript: expect.any(Number),
      react: expect.any(Number),
      "general-questions": expect.any(Number),
    });
    expect(
      hackFrontendKnowledgeBase.items.every(
        (source) =>
          Object.keys(source).sort().join(",") === "id,section,slug,url" &&
          source.url.startsWith("https://www.hackfrontend.com/ru/docs/"),
      ),
    ).toBe(true);
  });

  it("finds focused references by content tags without downloading article bodies", () => {
    expect(searchKnowledgeSources("event loop", { topic: "javascript", limit: 1 })[0]?.id).toBe(
      "hackfrontend:javascript/event-loop",
    );
    expect(searchKnowledgeSources("reconciliation", { topic: "react", limit: 1 })[0]?.id).toBe(
      "hackfrontend:react/reconciliation",
    );
    expect(searchKnowledgeSources("generic", { topic: "typescript", limit: 1 })[0]?.id).toBe(
      "hackfrontend:typescript/generic",
    );
  });
});

describe("mock interview catalog", () => {
  it("contains six tracks and thirty open questions", () => {
    expect(getMockInterviewStats(mockInterviewCatalog)).toEqual({
      sets: 6,
      questions: 30,
      tracks: [
        "frontend_core",
        "react",
        "javascript_deep_dive",
        "browser",
        "node_basics",
        "react_native",
      ],
    });
    expect(mockInterviewCatalog.sets.every((set) => set.questionIds.length === 5)).toBe(true);
  });

  it("keeps every set question and related learning item resolvable", () => {
    const questionIds = new Set(mockInterviewCatalog.questions.map((question) => question.id));
    const contentIds = new Set(contentItems.map((item) => item.id));

    expect(
      mockInterviewCatalog.sets.every((set) =>
        set.questionIds.every((questionId) => questionIds.has(questionId)),
      ),
    ).toBe(true);
    expect(
      mockInterviewCatalog.questions.every((question) =>
        question.relatedContentIds.every((contentId) => contentIds.has(contentId)),
      ),
    ).toBe(true);
  });

  it("does not silently drop raw interview data during validation", () => {
    expect(mockInterviewCatalog.questions).toHaveLength(rawMockInterviewCatalog.questions.length);
    expect(mockInterviewCatalog.sets).toHaveLength(rawMockInterviewCatalog.sets.length);
  });

  it("rejects a set that references a missing interview question", () => {
    const invalid = {
      ...rawMockInterviewCatalog,
      sets: rawMockInterviewCatalog.sets.map((set, index) =>
        index === 0
          ? { ...set, questionIds: [...set.questionIds.slice(0, 4), "miq-core-missing-999"] }
          : set,
      ),
    };

    expect(() => validateMockInterviewContent(invalid)).toThrow(/Не найден вопрос/);
  });

  it("rejects a question linked to a missing learning item", () => {
    const invalid = {
      ...rawMockInterviewCatalog,
      questions: rawMockInterviewCatalog.questions.map((question, index) =>
        index === 0 ? { ...question, relatedContentIds: ["js-missing-item-999"] } : question,
      ),
    };

    expect(() => validateMockInterviewContent(invalid)).toThrow(/отсутствующим материалом/);
  });
});
