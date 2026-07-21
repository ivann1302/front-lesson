import type {
  AnswerSubmission,
  ChoiceOption,
  CodeLanguage,
  ContentType,
  Difficulty,
  LearningCatalogResponse,
  MockInterviewCatalogResponse,
  MockInterviewDuration,
  MockInterviewHistoryResponse,
  MockInterviewReportResponse,
  MockInterviewSessionResponse,
  ReviewRating,
  StatsResponse,
  TelegramLinkCodeResponse,
  TheoryArticle,
  TheoryUserState,
  Topic,
  UpdateTheoryStateRequest,
  UpdateSettingsRequest,
  UserSettings,
} from "@mentor/shared";

const apiBase = (import.meta.env.VITE_API_URL || "/api").replace(/\/$/, "");
const guestTokenKey = "frontend-mentor-guest-token";

type ItemStatus = "pending" | "answered" | "skipped";

type DailyItemBase<T extends ContentType> = {
  id: string;
  version: number;
  type: T;
  topic: Topic;
  subtopic: string;
  difficulty: Difficulty;
  tags: string[];
  prompt: string;
  estimatedSeconds: number;
  status: ItemStatus;
};

export type DailyItem =
  | (DailyItemBase<"term"> & { term: string })
  | DailyItemBase<"flashcard">
  | (DailyItemBase<"single_choice" | "multiple_choice"> & {
      options: ChoiceOption[];
      code?: string;
      language?: CodeLanguage;
    })
  | (DailyItemBase<"code_output" | "find_bug"> & {
      code: string;
      language: CodeLanguage;
    })
  | DailyItemBase<"interview_question">;

export type DailySession = {
  session: {
    id: string;
    localDate: string;
    status: "pending" | "active" | "completed";
    answered: number;
    total: number;
  };
  items: DailyItem[];
};

export type AnswerFeedback = {
  explanation: string;
  definition?: string;
  answer?: string;
  solution?: string;
  correctOptionIds?: string[];
  rubric?: string[];
  referencePoints?: string[];
};

export type SubmitAnswerResponse = {
  answer: {
    id: string;
    clientAnswerId: string;
    contentId: string;
    isCorrect: boolean | null;
    rating: ReviewRating;
  };
  feedback: AnswerFeedback;
  review: {
    intervalDays: number;
    nextDueAt: string;
    ease: number;
    streak: number;
    lapses: number;
  };
  session: {
    status: "active" | "completed";
    answered: number;
    total: number;
  };
};

export type TheoryCatalogItem = Pick<
  TheoryArticle,
  "id" | "topic" | "slug" | "title" | "summary" | "estimatedMinutes"
> & { state: TheoryUserState };

export type TheoryCatalogResponse = {
  total: number;
  summary: {
    started: number;
    completed: number;
    completionPercent: number;
    bookmarked: number;
  };
  items: TheoryCatalogItem[];
};

export type TheoryArticleResponse = TheoryArticle & { state: TheoryUserState };

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
  ) {
    super(code);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  if (!response.ok) throw new ApiError(body?.error ?? "REQUEST_FAILED", response.status);
  return body as T;
}

function browserTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

let guestPromise: Promise<string> | undefined;

export function ensureGuest(): Promise<string> {
  guestPromise ??= (async () => {
    const storedToken = window.localStorage.getItem(guestTokenKey) ?? undefined;
    const guest = await request<{ userId: string; guestToken: string }>("/auth/guest", {
      method: "POST",
      body: JSON.stringify({ timezone: browserTimezone(), guestToken: storedToken }),
    });
    window.localStorage.setItem(guestTokenKey, guest.guestToken);
    return guest.guestToken;
  })().catch((error: unknown) => {
    guestPromise = undefined;
    throw error;
  });
  return guestPromise;
}

export async function loadToday(): Promise<DailySession> {
  const guestToken = await ensureGuest();
  return request<DailySession>("/study/today", {
    headers: { "x-guest-token": guestToken },
  });
}

export async function loadSettings(): Promise<UserSettings> {
  const guestToken = await ensureGuest();
  return request<UserSettings>("/settings", {
    headers: { "x-guest-token": guestToken },
  });
}

export async function loadStats(): Promise<StatsResponse> {
  const guestToken = await ensureGuest();
  return request<StatsResponse>("/stats", {
    headers: { "x-guest-token": guestToken },
  });
}

export async function loadLearning(): Promise<LearningCatalogResponse> {
  const guestToken = await ensureGuest();
  return request<LearningCatalogResponse>("/learning", {
    headers: { "x-guest-token": guestToken },
  });
}

export async function loadTheoryCatalog(): Promise<TheoryCatalogResponse> {
  const guestToken = await ensureGuest();
  return request<TheoryCatalogResponse>("/theory", {
    headers: { "x-guest-token": guestToken },
  });
}

export async function loadTheoryArticle(articleId: string): Promise<TheoryArticleResponse> {
  const guestToken = await ensureGuest();
  return request<TheoryArticleResponse>(`/theory/${encodeURIComponent(articleId)}`, {
    headers: { "x-guest-token": guestToken },
  });
}

export async function updateTheoryState(input: {
  articleId: string;
  state: UpdateTheoryStateRequest;
}): Promise<TheoryUserState> {
  const guestToken = await ensureGuest();
  return request<TheoryUserState>(`/theory/${encodeURIComponent(input.articleId)}/state`, {
    method: "PUT",
    headers: { "x-guest-token": guestToken },
    body: JSON.stringify(input.state),
  });
}

export async function createPracticeSession(contentIds: string[]): Promise<DailySession> {
  const guestToken = await ensureGuest();
  return request<DailySession>("/study/practice", {
    method: "POST",
    headers: { "x-guest-token": guestToken },
    body: JSON.stringify({ contentIds }),
  });
}

export async function loadPracticeSession(sessionId: string): Promise<DailySession> {
  const guestToken = await ensureGuest();
  return request<DailySession>(`/study/practice/${sessionId}`, {
    headers: { "x-guest-token": guestToken },
  });
}

export async function loadMockInterviews(): Promise<MockInterviewCatalogResponse> {
  const guestToken = await ensureGuest();
  return request<MockInterviewCatalogResponse>("/mock-interviews", {
    headers: { "x-guest-token": guestToken },
  });
}

export async function loadMockInterviewHistory(): Promise<MockInterviewHistoryResponse> {
  const guestToken = await ensureGuest();
  return request<MockInterviewHistoryResponse>("/mock-interviews/history", {
    headers: { "x-guest-token": guestToken },
  });
}

export async function loadMockInterviewReport(
  sessionId: string,
): Promise<MockInterviewReportResponse> {
  const guestToken = await ensureGuest();
  return request<MockInterviewReportResponse>(`/mock-interviews/sessions/${sessionId}/report`, {
    headers: { "x-guest-token": guestToken },
  });
}

export async function createMockInterviewPractice(sessionId: string): Promise<DailySession> {
  const guestToken = await ensureGuest();
  return request<DailySession>(`/mock-interviews/sessions/${sessionId}/practice`, {
    method: "POST",
    headers: { "x-guest-token": guestToken },
  });
}

export async function startMockInterview(input: {
  setId: string;
  durationMinutes: MockInterviewDuration;
}): Promise<MockInterviewSessionResponse> {
  const guestToken = await ensureGuest();
  return request<MockInterviewSessionResponse>("/mock-interviews/sessions", {
    method: "POST",
    headers: { "x-guest-token": guestToken },
    body: JSON.stringify(input),
  });
}

export async function loadMockInterviewSession(
  sessionId: string,
): Promise<MockInterviewSessionResponse> {
  const guestToken = await ensureGuest();
  return request<MockInterviewSessionResponse>(`/mock-interviews/sessions/${sessionId}`, {
    headers: { "x-guest-token": guestToken },
  });
}

export async function advanceMockInterview(input: {
  sessionId: string;
  questionId: string;
  rating: ReviewRating;
}): Promise<MockInterviewSessionResponse> {
  const guestToken = await ensureGuest();
  return request<MockInterviewSessionResponse>(
    `/mock-interviews/sessions/${input.sessionId}/next`,
    {
      method: "POST",
      headers: { "x-guest-token": guestToken },
      body: JSON.stringify({ questionId: input.questionId, rating: input.rating }),
    },
  );
}

export async function revealMockInterview(input: {
  sessionId: string;
  questionId: string;
  notes: string;
}): Promise<MockInterviewSessionResponse> {
  const guestToken = await ensureGuest();
  return request<MockInterviewSessionResponse>(
    `/mock-interviews/sessions/${input.sessionId}/reveal`,
    {
      method: "POST",
      headers: { "x-guest-token": guestToken },
      body: JSON.stringify({ questionId: input.questionId, notes: input.notes }),
    },
  );
}

export async function completeMockInterview(
  sessionId: string,
): Promise<MockInterviewSessionResponse> {
  const guestToken = await ensureGuest();
  return request<MockInterviewSessionResponse>(`/mock-interviews/sessions/${sessionId}/complete`, {
    method: "POST",
    headers: { "x-guest-token": guestToken },
  });
}

export async function saveSettings(input: UpdateSettingsRequest): Promise<UserSettings> {
  const guestToken = await ensureGuest();
  return request<UserSettings>("/settings", {
    method: "PUT",
    headers: { "x-guest-token": guestToken },
    body: JSON.stringify(input),
  });
}

export async function createTelegramLinkCode(): Promise<TelegramLinkCodeResponse> {
  const guestToken = await ensureGuest();
  return request<TelegramLinkCodeResponse>("/auth/telegram-code", {
    method: "POST",
    headers: { "x-guest-token": guestToken },
  });
}

export async function submitAnswer(input: {
  clientAnswerId: string;
  sessionId: string;
  contentId: string;
  answer: AnswerSubmission;
  latencyMs: number;
}): Promise<SubmitAnswerResponse> {
  const guestToken = await ensureGuest();
  return request<SubmitAnswerResponse>("/answers", {
    method: "POST",
    headers: { "x-guest-token": guestToken },
    body: JSON.stringify(input),
  });
}
