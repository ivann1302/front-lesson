import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function createStorage(initial: Record<string, string> = {}): Storage {
  const values = new Map(Object.entries(initial));
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("web API client", () => {
  it("deduplicates concurrent guest bootstrap requests and persists the token", async () => {
    const storage = createStorage();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ userId: "user-1", guestToken: "guest-1" }, 201));
    vi.stubGlobal("window", { localStorage: storage });
    vi.stubGlobal("fetch", fetchMock);
    const { ensureGuest } = await import("./api");

    const tokens = await Promise.all([ensureGuest(), ensureGuest(), ensureGuest()]);

    expect(tokens).toEqual(["guest-1", "guest-1", "guest-1"]);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/guest",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"timezone"'),
      }),
    );
    expect(storage.getItem("frontend-mentor-guest-token")).toBe("guest-1");
  });

  it("restores a practice session with the authenticated guest token", async () => {
    const storage = createStorage({ "frontend-mentor-guest-token": "stored-guest" });
    const session = {
      session: {
        id: "practice-123",
        localDate: "2026-07-17",
        status: "active",
        answered: 1,
        total: 2,
      },
      items: [],
    };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ userId: "user-1", guestToken: "authenticated-guest" }, 201),
      )
      .mockResolvedValueOnce(jsonResponse(session));
    vi.stubGlobal("window", { localStorage: storage });
    vi.stubGlobal("fetch", fetchMock);
    const { loadPracticeSession } = await import("./api");

    await expect(loadPracticeSession("practice-123")).resolves.toEqual(session);
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      guestToken: "stored-guest",
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/study/practice/practice-123", {
      headers: { "x-guest-token": "authenticated-guest" },
    });
  });

  it("loads the theory catalog and a full article with the authenticated guest token", async () => {
    const storage = createStorage({ "frontend-mentor-guest-token": "stored-guest" });
    const catalog = {
      total: 1,
      summary: { started: 0, completed: 0, completionPercent: 0, bookmarked: 0 },
      items: [
        {
          id: "theory-js-closures",
          topic: "javascript",
          slug: "javascript-closures",
          title: "Замыкания",
          summary: "Краткое описание",
          estimatedMinutes: 7,
          state: {
            articleId: "theory-js-closures",
            status: "new",
            bookmarked: false,
            lastOpenedAt: null,
            completedAt: null,
          },
        },
      ],
    };
    const article = { ...catalog.items[0]!, sections: [], keyPoints: [], references: [] };
    const completedState = {
      ...catalog.items[0]!.state,
      status: "completed",
      completedAt: "2026-07-17T10:00:00.000Z",
    };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ userId: "user-1", guestToken: "authenticated-guest" }, 201),
      )
      .mockResolvedValueOnce(jsonResponse(catalog))
      .mockResolvedValueOnce(jsonResponse(article))
      .mockResolvedValueOnce(jsonResponse(completedState));
    vi.stubGlobal("window", { localStorage: storage });
    vi.stubGlobal("fetch", fetchMock);
    const { loadTheoryArticle, loadTheoryCatalog, updateTheoryState } = await import("./api");

    await expect(loadTheoryCatalog()).resolves.toEqual(catalog);
    await expect(loadTheoryArticle("theory-js-closures")).resolves.toEqual(article);
    await expect(
      updateTheoryState({
        articleId: "theory-js-closures",
        state: { status: "completed" },
      }),
    ).resolves.toEqual(completedState);
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/theory", {
      headers: { "x-guest-token": "authenticated-guest" },
    });
    expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/theory/theory-js-closures", {
      headers: { "x-guest-token": "authenticated-guest" },
    });
    expect(fetchMock).toHaveBeenNthCalledWith(4, "/api/theory/theory-js-closures/state", {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        "x-guest-token": "authenticated-guest",
      },
      body: JSON.stringify({ status: "completed" }),
    });
  });

  it("saves mock interview notes and loads the completed report", async () => {
    const storage = createStorage({ "frontend-mentor-guest-token": "stored-guest" });
    const response = {
      session: {
        id: "47f982ed-1144-4077-94b4-bce116bfd5af",
        setId: "mock-react",
        title: "React",
        status: "active",
        completionReason: null,
        durationMinutes: 15,
        currentQuestionIndex: 0,
        total: 5,
        assessedQuestions: 0,
        weakQuestions: 0,
        startedAt: "2026-07-17T10:00:00.000Z",
        endsAt: "2026-07-17T10:15:00.000Z",
        completedAt: null,
      },
      question: {
        id: "miq-react-reconciliation-001",
        prompt: "Объясните reconciliation.",
        tags: ["react"],
        estimatedSeconds: 180,
        position: 1,
        total: 5,
        notes: "Стабильный key важен.",
        revealed: true,
        referencePoints: ["React сопоставляет элементы одного уровня."],
      },
    };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ userId: "user-1", guestToken: "authenticated-guest" }, 201),
      )
      .mockResolvedValueOnce(jsonResponse(response))
      .mockResolvedValueOnce(jsonResponse(response))
      .mockResolvedValueOnce(
        jsonResponse({
          sessions: [],
          analytics: {
            summary: {
              sessions: 0,
              assessedQuestions: 0,
              weakQuestions: 0,
              confidencePercent: null,
            },
            trend: [],
            weakTopics: [],
          },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ session: response.session, questions: [] }))
      .mockResolvedValueOnce(
        jsonResponse({
          session: {
            id: "9f97d46b-6fc4-4214-96e6-9a9033d3823b",
            localDate: "2026-07-17",
            status: "pending",
            answered: 0,
            total: 2,
          },
          items: [],
        }),
      );
    vi.stubGlobal("window", { localStorage: storage });
    vi.stubGlobal("fetch", fetchMock);
    const {
      advanceMockInterview,
      createMockInterviewPractice,
      loadMockInterviewHistory,
      loadMockInterviewReport,
      revealMockInterview,
    } = await import("./api");

    await revealMockInterview({
      sessionId: response.session.id,
      questionId: response.question.id,
      notes: response.question.notes,
    });
    await advanceMockInterview({
      sessionId: response.session.id,
      questionId: response.question.id,
      rating: "hard",
    });
    await loadMockInterviewHistory();
    await loadMockInterviewReport(response.session.id);
    await createMockInterviewPractice(response.session.id);

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `/api/mock-interviews/sessions/${response.session.id}/reveal`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          questionId: response.question.id,
          notes: response.question.notes,
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      `/api/mock-interviews/sessions/${response.session.id}/next`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ questionId: response.question.id, rating: "hard" }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(4, "/api/mock-interviews/history", {
      headers: { "x-guest-token": "authenticated-guest" },
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      `/api/mock-interviews/sessions/${response.session.id}/report`,
      { headers: { "x-guest-token": "authenticated-guest" } },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      6,
      `/api/mock-interviews/sessions/${response.session.id}/practice`,
      {
        method: "POST",
        headers: { "x-guest-token": "authenticated-guest" },
      },
    );
  });

  it("exposes a typed API error without leaking response internals", async () => {
    const storage = createStorage();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ userId: "user-1", guestToken: "guest-1" }, 201))
      .mockResolvedValueOnce(jsonResponse({ error: "PRACTICE_SESSION_NOT_FOUND" }, 404));
    vi.stubGlobal("window", { localStorage: storage });
    vi.stubGlobal("fetch", fetchMock);
    const { loadPracticeSession } = await import("./api");

    await expect(loadPracticeSession("missing-session")).rejects.toMatchObject({
      name: "ApiError",
      message: "PRACTICE_SESSION_NOT_FOUND",
      code: "PRACTICE_SESSION_NOT_FOUND",
      status: 404,
    });
  });
});
