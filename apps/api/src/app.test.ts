import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

import { buildApp } from "./app";
import { createDatabase } from "./db/database";
import { seedContent } from "./db/seed";

const apps = [] as ReturnType<typeof buildApp>[];
const telegramInternalSecret = "test-telegram-internal-secret";

function createTestApp(options: { trustProxy?: false | number } = {}) {
  const database = createDatabase(":memory:");
  const app = buildApp({ database, telegramInternalSecret, ...options });
  apps.push(app);
  return { app, database };
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function createGuest(app: ReturnType<typeof buildApp>) {
  const response = await app.inject({
    method: "POST",
    url: "/auth/guest",
    payload: { timezone: "Europe/Moscow" },
  });
  expect(response.statusCode).toBe(201);
  return response.json<{ userId: string; guestToken: string }>();
}

async function linkGuestToTelegram(
  app: ReturnType<typeof buildApp>,
  guestToken: string,
  telegramUserId: string,
) {
  const codeResponse = await app.inject({
    method: "POST",
    url: "/auth/telegram-code",
    headers: { "x-guest-token": guestToken },
  });
  const response = await app.inject({
    method: "POST",
    url: "/auth/telegram-link",
    headers: { "x-telegram-internal-secret": telegramInternalSecret },
    payload: { code: codeResponse.json().code, telegramUserId },
  });
  expect(response.statusCode).toBe(200);
}

async function getToday(app: ReturnType<typeof buildApp>, guestToken: string) {
  const response = await app.inject({
    method: "GET",
    url: "/study/today",
    headers: { "x-guest-token": guestToken },
  });
  expect(response.statusCode).toBe(200);
  return response.json<{
    session: { id: string; localDate: string; total: number };
    items: { id: string; type: string; options?: { id: string; text: string }[] }[];
  }>();
}

describe("database bootstrap", () => {
  it("applies migrations and seeds all content", async () => {
    const { app, database } = createTestApp();
    await app.ready();
    await seedContent(database.db);
    const result = await database.client.execute("SELECT COUNT(*) AS count FROM content_items");
    const theoryStateTable = await database.client.execute(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'user_theory_state'",
    );
    const interviewAssessmentTable = await database.client.execute(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'mock_interview_question_assessments'",
    );
    expect(Number(result.rows[0]?.count)).toBe(60);
    expect(theoryStateTable.rows).toHaveLength(1);
    expect(interviewAssessmentTable.rows).toHaveLength(1);
  });
});

describe("GET /health", () => {
  it("returns public database status without secrets", async () => {
    const { app } = createTestApp();
    const response = await app.inject({ method: "GET", url: "/health" });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body).toMatchObject({ status: "ok", version: "0.2.0", database: "ok" });
    expect(body.timestamp).toEqual(expect.any(String));
    expect(JSON.stringify(body)).not.toContain("secret");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-frame-options"]).toBe("DENY");
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
    expect(response.headers["x-request-id"]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("hides internal server errors", async () => {
    const { app } = createTestApp();
    app.get("/test/database-busy", async () => {
      throw Object.assign(new Error("SQLITE_BUSY: database path is private"), {
        code: "SQLITE_BUSY",
      });
    });

    const response = await app.inject({ method: "GET", url: "/test/database-busy" });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ error: "DATABASE_BUSY" });
    expect(response.headers["retry-after"]).toBe("1");
    expect(response.body).not.toContain("database path is private");
  });

  it("uses forwarded client addresses only behind an explicitly trusted proxy", async () => {
    const direct = createTestApp();
    const proxied = createTestApp({ trustProxy: 1 });
    direct.app.get("/test/ip", async (request) => ({ ip: request.ip }));
    proxied.app.get("/test/ip", async (request) => ({ ip: request.ip }));
    const request = {
      method: "GET" as const,
      url: "/test/ip",
      remoteAddress: "192.0.2.10",
      headers: { "x-forwarded-for": "198.51.100.42" },
    };

    const directResponse = await direct.app.inject(request);
    const proxiedResponse = await proxied.app.inject(request);

    expect(directResponse.json()).toEqual({ ip: "192.0.2.10" });
    expect(proxiedResponse.json()).toEqual({ ip: "198.51.100.42" });
  });
});

describe("POST /auth/guest", () => {
  it("creates and restores the same guest identity", async () => {
    const { app } = createTestApp();
    const guest = await createGuest(app);

    const restored = await app.inject({
      method: "POST",
      url: "/auth/guest",
      payload: { guestToken: guest.guestToken, timezone: "Europe/Moscow" },
    });

    expect(restored.statusCode).toBe(200);
    expect(restored.json()).toEqual(guest);
    expect(restored.headers["cache-control"]).toBe("private, no-store");
  });

  it("rejects an invalid timezone", async () => {
    const { app } = createTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/auth/guest",
      payload: { timezone: "Moscow/Invalid" },
    });
    expect(response.statusCode).toBe(400);
  });

  it("rate limits guest creation by source address", async () => {
    const { app } = createTestApp();
    const responses = [];
    for (let index = 0; index < 31; index += 1) {
      responses.push(
        await app.inject({
          method: "POST",
          url: "/auth/guest",
          remoteAddress: "203.0.113.8",
          payload: { timezone: "UTC" },
        }),
      );
    }

    expect(responses.slice(0, 30).every((response) => response.statusCode === 201)).toBe(true);
    expect(responses[30]?.statusCode).toBe(429);
    expect(responses[30]?.json()).toEqual({ error: "RATE_LIMITED" });
    expect(responses[30]?.headers["retry-after"]).toBeDefined();
  });

  it("ignores an untrusted client request id", async () => {
    const { app } = createTestApp();
    const response = await app.inject({
      method: "GET",
      url: "/health",
      headers: { "x-request-id": "client-controlled-value" },
    });

    expect(response.headers["x-request-id"]).not.toBe("client-controlled-value");
    expect(response.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("rate limits answer writes before authentication", async () => {
    const { app } = createTestApp();
    const responses = [];
    for (let index = 0; index < 121; index += 1) {
      responses.push(
        await app.inject({
          method: "POST",
          url: "/answers",
          remoteAddress: "203.0.113.18",
          payload: {},
        }),
      );
    }

    expect(responses.slice(0, 120).every((response) => response.statusCode === 401)).toBe(true);
    expect(responses[119]?.headers["x-ratelimit-remaining"]).toBe("0");
    expect(responses[120]?.statusCode).toBe(429);
    expect(responses[120]?.json()).toEqual({ error: "RATE_LIMITED" });
    expect(responses[120]?.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("Telegram account linking", () => {
  it("creates a short-lived code without storing the credential in plaintext", async () => {
    const { app, database } = createTestApp();
    const unauthorized = await app.inject({ method: "POST", url: "/auth/telegram-code" });
    const guest = await createGuest(app);
    const response = await app.inject({
      method: "POST",
      url: "/auth/telegram-code",
      headers: { "x-guest-token": guest.guestToken },
    });
    const body = response.json<{ code: string; expiresAt: string }>();
    const stored = await database.client.execute(
      "SELECT code_hash, expires_at FROM telegram_link_codes",
    );

    expect(unauthorized.statusCode).toBe(401);
    expect(response.statusCode).toBe(201);
    expect(body.code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    expect(new Date(body.expiresAt).getTime()).toBeGreaterThan(Date.now());
    expect(stored.rows).toHaveLength(1);
    expect(stored.rows[0]?.code_hash).not.toBe(body.code);
    expect(String(stored.rows[0]?.code_hash)).toHaveLength(64);
  });

  it("lets the bot consume a code once and enables the Telegram channel", async () => {
    const { app, database } = createTestApp();
    const guest = await createGuest(app);
    const codeResponse = await app.inject({
      method: "POST",
      url: "/auth/telegram-code",
      headers: { "x-guest-token": guest.guestToken },
    });
    const { code } = codeResponse.json<{ code: string }>();
    const payload = { code: code.toLowerCase(), telegramUserId: "987654321" };
    const unauthorized = await app.inject({
      method: "POST",
      url: "/auth/telegram-link",
      payload,
    });
    const linked = await app.inject({
      method: "POST",
      url: "/auth/telegram-link",
      headers: { "x-telegram-internal-secret": telegramInternalSecret },
      payload,
    });
    const replay = await app.inject({
      method: "POST",
      url: "/auth/telegram-link",
      headers: { "x-telegram-internal-secret": telegramInternalSecret },
      payload,
    });
    const identity = await database.client.execute({
      sql: "SELECT user_id FROM auth_identities WHERE provider = 'telegram' AND provider_user_id = ?",
      args: [payload.telegramUserId],
    });
    const settings = await database.client.execute({
      sql: "SELECT channel FROM notification_settings WHERE user_id = ?",
      args: [guest.userId],
    });

    expect(unauthorized.statusCode).toBe(401);
    expect(linked.statusCode).toBe(200);
    expect(linked.json()).toEqual({
      linked: true,
      userId: guest.userId,
      telegramUserId: payload.telegramUserId,
    });
    expect(replay.statusCode).toBe(410);
    expect(replay.json()).toEqual({ error: "LINK_CODE_USED" });
    expect(identity.rows[0]?.user_id).toBe(guest.userId);
    expect(settings.rows[0]?.channel).toBe("telegram");
  });

  it("rejects expired codes and prevents one Telegram account from owning two users", async () => {
    const { app, database } = createTestApp();
    const firstGuest = await createGuest(app);
    const secondGuest = await createGuest(app);
    const firstCode = await app.inject({
      method: "POST",
      url: "/auth/telegram-code",
      headers: { "x-guest-token": firstGuest.guestToken },
    });
    const secondCode = await app.inject({
      method: "POST",
      url: "/auth/telegram-code",
      headers: { "x-guest-token": secondGuest.guestToken },
    });
    const headers = { "x-telegram-internal-secret": telegramInternalSecret };
    const telegramUserId = "123456789";

    const linked = await app.inject({
      method: "POST",
      url: "/auth/telegram-link",
      headers,
      payload: { code: firstCode.json().code, telegramUserId },
    });
    const conflict = await app.inject({
      method: "POST",
      url: "/auth/telegram-link",
      headers,
      payload: { code: secondCode.json().code, telegramUserId },
    });
    const retryWithAnotherTelegram = await app.inject({
      method: "POST",
      url: "/auth/telegram-link",
      headers,
      payload: { code: secondCode.json().code, telegramUserId: "123456790" },
    });

    expect(linked.statusCode).toBe(200);
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toEqual({ error: "TELEGRAM_ALREADY_LINKED" });
    expect(retryWithAnotherTelegram.statusCode).toBe(200);

    const expiringGuest = await createGuest(app);
    const expiringCode = await app.inject({
      method: "POST",
      url: "/auth/telegram-code",
      headers: { "x-guest-token": expiringGuest.guestToken },
    });
    await database.client.execute("UPDATE telegram_link_codes SET expires_at = 0");
    const expired = await app.inject({
      method: "POST",
      url: "/auth/telegram-link",
      headers,
      payload: { code: expiringCode.json().code, telegramUserId: "123456791" },
    });

    expect(expired.statusCode).toBe(410);
    expect(expired.json()).toEqual({ error: "LINK_CODE_EXPIRED" });
  });
});

describe("POST /bot/study/today", () => {
  it("requires the internal secret and a linked Telegram identity", async () => {
    const { app } = createTestApp();
    const unauthorized = await app.inject({
      method: "POST",
      url: "/bot/study/today",
      payload: { telegramUserId: "123456789" },
    });
    const missingIdentity = await app.inject({
      method: "POST",
      url: "/bot/study/today",
      headers: { "x-telegram-internal-secret": telegramInternalSecret },
      payload: { telegramUserId: "123456789" },
    });

    expect(unauthorized.statusCode).toBe(401);
    expect(missingIdentity.statusCode).toBe(404);
    expect(missingIdentity.json()).toEqual({ error: "TELEGRAM_IDENTITY_NOT_FOUND" });
  });

  it("returns the same stable daily session without exposing answers", async () => {
    const { app } = createTestApp();
    const guest = await createGuest(app);
    const telegramUserId = "555666777";
    await linkGuestToTelegram(app, guest.guestToken, telegramUserId);

    const botToday = await app.inject({
      method: "POST",
      url: "/bot/study/today",
      headers: { "x-telegram-internal-secret": telegramInternalSecret },
      payload: { telegramUserId },
    });
    const webToday = await getToday(app, guest.guestToken);
    const body = botToday.json<{
      session: { id: string; answered: number; total: number };
      nextItem: Record<string, unknown> | null;
    }>();

    expect(botToday.statusCode).toBe(200);
    expect(body.session).toMatchObject({ id: webToday.session.id, answered: 0, total: 5 });
    expect(body.nextItem).toMatchObject({
      id: webToday.items[0]?.id,
      prompt: expect.any(String),
      estimatedSeconds: expect.any(Number),
    });
    expect(body.nextItem).not.toHaveProperty("answer");
    expect(body.nextItem).not.toHaveProperty("explanation");
    expect(body.nextItem).not.toHaveProperty("correctOptionIds");
  });

  it("issues opaque callbacks and records a single-choice answer idempotently", async () => {
    const { app, database } = createTestApp();
    const guest = await createGuest(app);
    const telegramUserId = "777888999";
    await linkGuestToTelegram(app, guest.guestToken, telegramUserId);
    const today = await getToday(app, guest.guestToken);
    const guestHeaders = { "x-guest-token": guest.guestToken };

    for (const item of today.items.slice(0, 2)) {
      const response = await app.inject({
        method: "POST",
        url: "/answers",
        headers: guestHeaders,
        payload: {
          clientAnswerId: randomUUID(),
          sessionId: today.session.id,
          contentId: item.id,
          answer: { kind: "self_assessment", rating: "good" },
        },
      });
      expect(response.statusCode).toBe(201);
    }

    const internalHeaders = { "x-telegram-internal-secret": telegramInternalSecret };
    const botToday = await app.inject({
      method: "POST",
      url: "/bot/study/today",
      headers: internalHeaders,
      payload: { telegramUserId },
    });
    const options = botToday.json<{
      nextItem: { id: string; type: string; options: { text: string; callbackData: string }[] };
    }>().nextItem.options;

    expect(botToday.statusCode).toBe(200);
    expect(options.length).toBeGreaterThan(1);
    expect(options[0]).toEqual({
      text: expect.any(String),
      callbackData: expect.stringMatching(/^answer:[A-Za-z0-9_-]{12}$/),
    });
    expect(options[0]).not.toHaveProperty("id");
    expect(options[0]?.callbackData).not.toContain("js-array-map-003");

    const payload = { telegramUserId, callbackData: options[0]!.callbackData };
    const answered = await app.inject({
      method: "POST",
      url: "/bot/answers",
      headers: internalHeaders,
      payload,
    });
    const replay = await app.inject({
      method: "POST",
      url: "/bot/answers",
      headers: internalHeaders,
      payload,
    });
    const differentOption = await app.inject({
      method: "POST",
      url: "/bot/answers",
      headers: internalHeaders,
      payload: { telegramUserId, callbackData: options[1]!.callbackData },
    });
    const answerCount = await database.client.execute("SELECT COUNT(*) AS count FROM answers");

    expect(answered.statusCode).toBe(201);
    expect(answered.json()).toMatchObject({
      answer: { isCorrect: true },
      feedback: { explanation: expect.any(String) },
      session: { status: "active", answered: 3, total: 5 },
    });
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toEqual(answered.json());
    expect(differentOption.statusCode).toBe(409);
    expect(differentOption.json()).toEqual({ error: "ALREADY_ANSWERED" });
    expect(Number(answerCount.rows[0]?.count)).toBe(3);
  });

  it("rejects expired or foreign callback tokens", async () => {
    const { app, database } = createTestApp();
    const owner = await createGuest(app);
    const stranger = await createGuest(app);
    await linkGuestToTelegram(app, owner.guestToken, "111222333");
    await linkGuestToTelegram(app, stranger.guestToken, "111222334");
    const today = await getToday(app, owner.guestToken);

    for (const item of today.items.slice(0, 2)) {
      await app.inject({
        method: "POST",
        url: "/answers",
        headers: { "x-guest-token": owner.guestToken },
        payload: {
          clientAnswerId: randomUUID(),
          sessionId: today.session.id,
          contentId: item.id,
          answer: { kind: "self_assessment", rating: "good" },
        },
      });
    }

    const internalHeaders = { "x-telegram-internal-secret": telegramInternalSecret };
    const botToday = await app.inject({
      method: "POST",
      url: "/bot/study/today",
      headers: internalHeaders,
      payload: { telegramUserId: "111222333" },
    });
    const callbackData = botToday.json().nextItem.options[0].callbackData as string;
    const foreign = await app.inject({
      method: "POST",
      url: "/bot/answers",
      headers: internalHeaders,
      payload: { telegramUserId: "111222334", callbackData },
    });
    await database.client.execute("UPDATE telegram_quiz_callbacks SET expires_at = 0");
    const expired = await app.inject({
      method: "POST",
      url: "/bot/answers",
      headers: internalHeaders,
      payload: { telegramUserId: "111222333", callbackData },
    });

    expect(foreign.statusCode).toBe(404);
    expect(foreign.json()).toEqual({ error: "CALLBACK_NOT_FOUND" });
    expect(expired.statusCode).toBe(410);
    expect(expired.json()).toEqual({ error: "CALLBACK_EXPIRED" });
  });
});

describe("Telegram settings and pause", () => {
  it("returns the shared schedule and persists pause/resume", async () => {
    const { app } = createTestApp();
    const guest = await createGuest(app);
    const telegramUserId = "444555666";
    await linkGuestToTelegram(app, guest.guestToken, telegramUserId);
    await app.inject({
      method: "PUT",
      url: "/settings",
      headers: { "x-guest-token": guest.guestToken },
      payload: {
        topics: ["typescript", "react"],
        dailyLimit: 2,
        localTime: "08:45",
        timezone: "Europe/Berlin",
      },
    });

    const internalHeaders = { "x-telegram-internal-secret": telegramInternalSecret };
    const unauthorized = await app.inject({
      method: "POST",
      url: "/bot/settings",
      payload: { telegramUserId },
    });
    const settings = await app.inject({
      method: "POST",
      url: "/bot/settings",
      headers: internalHeaders,
      payload: { telegramUserId },
    });

    expect(unauthorized.statusCode).toBe(401);
    expect(settings.statusCode).toBe(200);
    expect(settings.json()).toEqual({
      topics: ["typescript", "react"],
      dailyLimit: 2,
      localTime: "08:45",
      timezone: "Europe/Berlin",
      weekdays: [1, 2, 3, 4, 5, 6, 7],
      channel: "telegram",
      pausedUntil: null,
    });

    const beforePause = Date.now();
    const paused = await app.inject({
      method: "POST",
      url: "/bot/settings/pause",
      headers: internalHeaders,
      payload: { telegramUserId, action: "day" },
    });
    const pauseTimestamp = new Date(paused.json().pausedUntil).getTime();

    expect(paused.statusCode).toBe(200);
    expect(pauseTimestamp).toBeGreaterThanOrEqual(beforePause + 86_399_000);
    expect(pauseTimestamp).toBeLessThanOrEqual(Date.now() + 86_401_000);

    const resumed = await app.inject({
      method: "POST",
      url: "/bot/settings/pause",
      headers: internalHeaders,
      payload: { telegramUserId, action: "resume" },
    });
    expect(resumed.statusCode).toBe(200);
    expect(resumed.json().pausedUntil).toBeNull();
  });

  it("validates pause actions and rejects an unknown Telegram identity", async () => {
    const { app } = createTestApp();
    const headers = { "x-telegram-internal-secret": telegramInternalSecret };
    const unknown = await app.inject({
      method: "POST",
      url: "/bot/settings",
      headers,
      payload: { telegramUserId: "999888777" },
    });
    const invalid = await app.inject({
      method: "POST",
      url: "/bot/settings/pause",
      headers,
      payload: { telegramUserId: "999888777", action: "forever" },
    });

    expect(unknown.statusCode).toBe(404);
    expect(unknown.json()).toEqual({ error: "TELEGRAM_IDENTITY_NOT_FOUND" });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json().error).toBe("VALIDATION_ERROR");
  });
});

describe("GET and PUT /settings", () => {
  it("requires a guest identity", async () => {
    const { app } = createTestApp();
    const getResponse = await app.inject({ method: "GET", url: "/settings" });
    const putResponse = await app.inject({ method: "PUT", url: "/settings", payload: {} });
    expect(getResponse.statusCode).toBe(401);
    expect(putResponse.statusCode).toBe(401);
  });

  it("returns onboarding defaults and persists validated settings", async () => {
    const { app } = createTestApp();
    const guest = await createGuest(app);
    const headers = { "x-guest-token": guest.guestToken };
    const defaults = await app.inject({ method: "GET", url: "/settings", headers });

    expect(defaults.statusCode).toBe(200);
    expect(defaults.json()).toMatchObject({
      onboardingCompleted: false,
      dailyLimit: 5,
      localTime: "19:00",
      timezone: "Europe/Moscow",
    });
    expect(defaults.json().topics).toHaveLength(6);

    const payload = {
      topics: ["react"],
      dailyLimit: 3,
      localTime: "08:30",
      timezone: "Europe/Berlin",
    };
    const saved = await app.inject({
      method: "PUT",
      url: "/settings",
      headers,
      payload,
    });
    const restored = await app.inject({ method: "GET", url: "/settings", headers });

    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toEqual({ onboardingCompleted: true, ...payload });
    expect(restored.json()).toEqual(saved.json());

    const today = await app.inject({ method: "GET", url: "/study/today", headers });
    expect(today.statusCode).toBe(200);
    expect(today.json().session.total).toBe(3);
    expect(today.json().items).toHaveLength(3);
    expect(today.json().items.every((item: { topic: string }) => item.topic === "react")).toBe(
      true,
    );
  });

  it("rejects empty topics, an invalid time and an invalid timezone", async () => {
    const { app } = createTestApp();
    const guest = await createGuest(app);
    const response = await app.inject({
      method: "PUT",
      url: "/settings",
      headers: { "x-guest-token": guest.guestToken },
      payload: {
        topics: [],
        dailyLimit: 7,
        localTime: "25:90",
        timezone: "Moscow/Invalid",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("VALIDATION_ERROR");
  });
});

describe("GET /study/today", () => {
  it("requires a guest identity", async () => {
    const { app } = createTestApp();
    const response = await app.inject({ method: "GET", url: "/study/today" });
    expect(response.statusCode).toBe(401);
  });

  it("creates one stable daily session without exposing answers", async () => {
    const { app } = createTestApp();
    const guest = await createGuest(app);
    const headers = { "x-guest-token": guest.guestToken };

    const first = await app.inject({ method: "GET", url: "/study/today", headers });
    const second = await app.inject({ method: "GET", url: "/study/today", headers });
    const firstBody = first.json<{
      session: { id: string; localDate: string; answered: number; total: number };
      items: Record<string, unknown>[];
    }>();
    const secondBody = second.json<typeof firstBody>();

    expect(first.statusCode).toBe(200);
    expect(firstBody.session.total).toBe(5);
    expect(firstBody.session.answered).toBe(0);
    expect(firstBody.items).toHaveLength(5);
    expect(secondBody.session.id).toBe(firstBody.session.id);
    expect(secondBody.items.map((item) => item.id)).toEqual(firstBody.items.map((item) => item.id));

    for (const item of firstBody.items) {
      expect(item.status).toBe("pending");
      expect(item).not.toHaveProperty("correctOptionIds");
      expect(item).not.toHaveProperty("answer");
      expect(item).not.toHaveProperty("definition");
      expect(item).not.toHaveProperty("explanation");
      expect(item).not.toHaveProperty("solution");
      expect(item).not.toHaveProperty("referencePoints");
      expect(item).not.toHaveProperty("rubric");
    }
  });

  it("creates one daily session under concurrent first requests", async () => {
    const { app } = createTestApp();
    const guest = await createGuest(app);
    const headers = { "x-guest-token": guest.guestToken };

    const responses = await Promise.all(
      Array.from({ length: 8 }, () => app.inject({ method: "GET", url: "/study/today", headers })),
    );
    const sessionIds = responses.map(
      (response) => response.json<{ session: { id: string } }>().session.id,
    );

    expect(responses.map((response) => response.statusCode)).toEqual(Array(8).fill(200));
    expect(new Set(sessionIds).size).toBe(1);
  });
});

describe("learning catalog and practice sessions", () => {
  it("requires a guest identity", async () => {
    const { app } = createTestApp();
    const catalog = await app.inject({ method: "GET", url: "/learning" });
    const practice = await app.inject({
      method: "POST",
      url: "/study/practice",
      payload: { contentIds: ["react-reconciliation-001"] },
    });
    const restored = await app.inject({
      method: "GET",
      url: "/study/practice/not-authenticated",
    });

    expect(catalog.statusCode).toBe(401);
    expect(practice.statusCode).toBe(401);
    expect(restored.statusCode).toBe(401);
  });

  it("returns all public materials with honest progress", async () => {
    const { app } = createTestApp();
    const guest = await createGuest(app);
    const response = await app.inject({
      method: "GET",
      url: "/learning",
      headers: { "x-guest-token": guest.guestToken },
    });
    const body = response.json<{
      summary: { total: number; seen: number; mastered: number; due: number };
      topics: { topic: string; total: number }[];
      items: Record<string, unknown>[];
    }>();

    expect(response.statusCode).toBe(200);
    expect(body.summary).toEqual({ total: 60, seen: 0, mastered: 0, due: 0 });
    expect(body.topics).toHaveLength(6);
    expect(body.topics.every((topic) => topic.total === 10)).toBe(true);
    expect(body.items).toHaveLength(60);
    expect(body.items.every((item) => item.progressStatus === "new")).toBe(true);
    expect(body.items[0]).not.toHaveProperty("answer");
    expect(body.items[0]).not.toHaveProperty("explanation");
    expect(body.items[0]).not.toHaveProperty("correctOptionIds");
  });

  it("creates multiple ordered practice sessions on the same day", async () => {
    const { app, database } = createTestApp();
    const guest = await createGuest(app);
    const headers = { "x-guest-token": guest.guestToken };
    const payload = {
      contentIds: ["react-effect-deps-003", "react-reconciliation-001"],
    };

    const first = await app.inject({
      method: "POST",
      url: "/study/practice",
      headers,
      payload,
    });
    const second = await app.inject({
      method: "POST",
      url: "/study/practice",
      headers,
      payload: { contentIds: ["css-flex-min-width-003"] },
    });

    expect(first.statusCode).toBe(201);
    expect(first.json().session).toMatchObject({ status: "pending", answered: 0, total: 2 });
    expect(first.json().items.map((item: { id: string }) => item.id)).toEqual(payload.contentIds);
    expect(first.json().items[0]).not.toHaveProperty("correctOptionIds");
    expect(second.statusCode).toBe(201);
    expect(second.json().session.id).not.toBe(first.json().session.id);

    const count = await database.client.execute(
      "SELECT COUNT(*) AS count FROM study_sessions WHERE kind = 'mock'",
    );
    expect(Number(count.rows[0]?.count)).toBe(2);
  });

  it("restores only the owner's practice session in its original order", async () => {
    const { app } = createTestApp();
    const owner = await createGuest(app);
    const stranger = await createGuest(app);
    const contentIds = ["react-effect-deps-003", "react-reconciliation-001"];
    const created = await app.inject({
      method: "POST",
      url: "/study/practice",
      headers: { "x-guest-token": owner.guestToken },
      payload: { contentIds },
    });
    const sessionId = created.json<{ session: { id: string } }>().session.id;

    const restored = await app.inject({
      method: "GET",
      url: `/study/practice/${sessionId}`,
      headers: { "x-guest-token": owner.guestToken },
    });
    const foreign = await app.inject({
      method: "GET",
      url: `/study/practice/${sessionId}`,
      headers: { "x-guest-token": stranger.guestToken },
    });

    expect(restored.statusCode).toBe(200);
    expect(restored.json().session).toMatchObject({
      id: sessionId,
      status: "pending",
      answered: 0,
      total: 2,
    });
    expect(restored.json().items.map((item: { id: string }) => item.id)).toEqual(contentIds);
    expect(restored.json().items[0]).not.toHaveProperty("explanation");
    expect(foreign.statusCode).toBe(404);
    expect(foreign.json()).toEqual({ error: "PRACTICE_SESSION_NOT_FOUND" });
  });

  it("validates practice material ids", async () => {
    const { app } = createTestApp();
    const guest = await createGuest(app);
    const headers = { "x-guest-token": guest.guestToken };
    const duplicate = await app.inject({
      method: "POST",
      url: "/study/practice",
      headers,
      payload: { contentIds: ["react-reconciliation-001", "react-reconciliation-001"] },
    });
    const missing = await app.inject({
      method: "POST",
      url: "/study/practice",
      headers,
      payload: { contentIds: ["react-unknown-item-999"] },
    });

    expect(duplicate.statusCode).toBe(400);
    expect(missing.statusCode).toBe(404);
  });
});

describe("theory knowledge base", () => {
  it("requires a guest identity", async () => {
    const { app } = createTestApp();

    const catalog = await app.inject({ method: "GET", url: "/theory" });
    const article = await app.inject({
      method: "GET",
      url: "/theory/theory-js-closures",
    });
    const state = await app.inject({
      method: "PUT",
      url: "/theory/theory-js-closures/state",
      payload: { status: "reading" },
    });

    expect(catalog.statusCode).toBe(401);
    expect(article.statusCode).toBe(401);
    expect(state.statusCode).toBe(401);
  });

  it("returns original theory summaries and a full attributed article", async () => {
    const { app } = createTestApp();
    const guest = await createGuest(app);
    const headers = { "x-guest-token": guest.guestToken };

    const catalog = await app.inject({ method: "GET", url: "/theory", headers });
    const article = await app.inject({
      method: "GET",
      url: "/theory/theory-js-closures",
      headers,
    });

    expect(catalog.statusCode).toBe(200);
    expect(catalog.json()).toMatchObject({
      total: 18,
      summary: { started: 0, completed: 0, completionPercent: 0, bookmarked: 0 },
    });
    expect(catalog.json().items).toHaveLength(18);
    expect(catalog.json().items[0]).not.toHaveProperty("sections");
    expect(catalog.json().items[0]).not.toHaveProperty("relatedContentIds");
    expect(catalog.json().items[0].state).toMatchObject({
      status: "new",
      bookmarked: false,
    });
    expect(article.statusCode).toBe(200);
    expect(article.json()).toMatchObject({
      id: "theory-js-closures",
      topic: "javascript",
      sourceIds: ["hackfrontend:javascript/closures"],
      relatedContentIds: ["js-closure-scope-001", "js-var-loop-006"],
      state: { status: "new", bookmarked: false },
    });
    expect(article.json().sections[0].example.code).toContain("createRequestCounter");
    expect(
      article.json().references.some((reference: { kind: string }) => reference.kind === "primary"),
    ).toBe(true);
  });

  it("persists reading progress and bookmarks without downgrading completed articles", async () => {
    const { app, database } = createTestApp();
    const guest = await createGuest(app);
    const stranger = await createGuest(app);
    const headers = { "x-guest-token": guest.guestToken };
    const articleId = "theory-js-closures";

    const reading = await app.inject({
      method: "PUT",
      url: `/theory/${articleId}/state`,
      headers,
      payload: { status: "reading", bookmarked: true },
    });
    const completed = await app.inject({
      method: "PUT",
      url: `/theory/${articleId}/state`,
      headers,
      payload: { status: "completed" },
    });
    const retryReading = await app.inject({
      method: "PUT",
      url: `/theory/${articleId}/state`,
      headers,
      payload: { status: "reading" },
    });

    expect(reading.statusCode).toBe(200);
    expect(reading.json()).toMatchObject({
      articleId,
      status: "reading",
      bookmarked: true,
    });
    expect(completed.json()).toMatchObject({ status: "completed", bookmarked: true });
    expect(completed.json().completedAt).toEqual(expect.any(String));
    expect(retryReading.json()).toMatchObject({ status: "completed", bookmarked: true });
    expect(retryReading.json().completedAt).toBe(completed.json().completedAt);

    const catalog = await app.inject({ method: "GET", url: "/theory", headers });
    const article = await app.inject({ method: "GET", url: `/theory/${articleId}`, headers });
    const strangerCatalog = await app.inject({
      method: "GET",
      url: "/theory",
      headers: { "x-guest-token": stranger.guestToken },
    });
    expect(catalog.json().summary).toEqual({
      started: 1,
      completed: 1,
      completionPercent: 6,
      bookmarked: 1,
    });
    expect(
      catalog.json().items.find((item: { id: string }) => item.id === articleId).state,
    ).toMatchObject({ status: "completed", bookmarked: true });
    expect(article.json().state).toMatchObject({ status: "completed", bookmarked: true });
    expect(strangerCatalog.json().summary).toEqual({
      started: 0,
      completed: 0,
      completionPercent: 0,
      bookmarked: 0,
    });

    const rows = await database.client.execute(
      "SELECT status, bookmarked FROM user_theory_state WHERE article_id = ?",
      [articleId],
    );
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]).toMatchObject({ status: "completed", bookmarked: 1 });
  });

  it("validates theory state updates and rejects unknown articles", async () => {
    const { app } = createTestApp();
    const guest = await createGuest(app);
    const headers = { "x-guest-token": guest.guestToken };

    const empty = await app.inject({
      method: "PUT",
      url: "/theory/theory-js-closures/state",
      headers,
      payload: {},
    });
    const unknown = await app.inject({
      method: "PUT",
      url: "/theory/theory-js-missing/state",
      headers,
      payload: { bookmarked: true },
    });

    expect(empty.statusCode).toBe(400);
    expect(empty.json()).toMatchObject({ error: "VALIDATION_ERROR" });
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json()).toEqual({ error: "THEORY_ARTICLE_NOT_FOUND" });
  });

  it("does not expose whether an unknown theory id ever existed", async () => {
    const { app } = createTestApp();
    const guest = await createGuest(app);
    const response = await app.inject({
      method: "GET",
      url: "/theory/theory-js-missing",
      headers: { "x-guest-token": guest.guestToken },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "THEORY_ARTICLE_NOT_FOUND" });
  });
});

describe("POST /answers", () => {
  it("requires a guest identity", async () => {
    const { app } = createTestApp();
    const response = await app.inject({
      method: "POST",
      url: "/answers",
      payload: {},
    });
    expect(response.statusCode).toBe(401);
  });

  it("checks a choice, reveals feedback, updates review state and is idempotent", async () => {
    const { app, database } = createTestApp();
    const guest = await createGuest(app);
    const today = await getToday(app, guest.guestToken);
    const item = today.items.find((candidate) => candidate.id === "js-array-map-003");
    expect(item?.type).toBe("single_choice");

    const payload = {
      clientAnswerId: randomUUID(),
      sessionId: today.session.id,
      contentId: item!.id,
      answer: { kind: "selection", selectedOptionIds: ["a"] },
      latencyMs: 1_250,
    };
    const headers = { "x-guest-token": guest.guestToken };
    const first = await app.inject({ method: "POST", url: "/answers", headers, payload });
    const retry = await app.inject({ method: "POST", url: "/answers", headers, payload });

    expect(first.statusCode).toBe(201);
    expect(retry.statusCode).toBe(200);
    expect(retry.json()).toEqual(first.json());
    expect(first.json()).toMatchObject({
      answer: {
        clientAnswerId: payload.clientAnswerId,
        contentId: item!.id,
        isCorrect: true,
        rating: "good",
      },
      feedback: { correctOptionIds: ["a"] },
      review: { intervalDays: 1, streak: 1, lapses: 0 },
      session: { status: "active", answered: 1, total: 5 },
    });
    expect(first.json().feedback.explanation).toEqual(expect.any(String));
    expect(new Date(first.json().review.nextDueAt).getTime()).toBeGreaterThan(Date.now());

    const answerCount = await database.client.execute("SELECT COUNT(*) AS count FROM answers");
    const stateCount = await database.client.execute(
      "SELECT COUNT(*) AS count FROM user_content_state",
    );
    expect(Number(answerCount.rows[0]?.count)).toBe(1);
    expect(Number(stateCount.rows[0]?.count)).toBe(1);
  });

  it("rejects reuse of an idempotency key with a different answer", async () => {
    const { app } = createTestApp();
    const guest = await createGuest(app);
    const today = await getToday(app, guest.guestToken);
    const headers = { "x-guest-token": guest.guestToken };
    const base = {
      clientAnswerId: randomUUID(),
      sessionId: today.session.id,
      contentId: "js-array-map-003",
    };

    const first = await app.inject({
      method: "POST",
      url: "/answers",
      headers,
      payload: { ...base, answer: { kind: "selection", selectedOptionIds: ["a"] } },
    });
    const conflict = await app.inject({
      method: "POST",
      url: "/answers",
      headers,
      payload: { ...base, answer: { kind: "selection", selectedOptionIds: ["b"] } },
    });

    expect(first.statusCode).toBe(201);
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toEqual({ error: "IDEMPOTENCY_CONFLICT" });
  });

  it("does not accept a second answer or a session owned by another guest", async () => {
    const { app } = createTestApp();
    const owner = await createGuest(app);
    const stranger = await createGuest(app);
    const today = await getToday(app, owner.guestToken);
    const answer = { kind: "selection", selectedOptionIds: ["b"] };
    const ownerHeaders = { "x-guest-token": owner.guestToken };

    const first = await app.inject({
      method: "POST",
      url: "/answers",
      headers: ownerHeaders,
      payload: {
        clientAnswerId: randomUUID(),
        sessionId: today.session.id,
        contentId: "js-array-map-003",
        answer,
      },
    });
    const second = await app.inject({
      method: "POST",
      url: "/answers",
      headers: ownerHeaders,
      payload: {
        clientAnswerId: randomUUID(),
        sessionId: today.session.id,
        contentId: "js-array-map-003",
        answer,
      },
    });
    const foreign = await app.inject({
      method: "POST",
      url: "/answers",
      headers: { "x-guest-token": stranger.guestToken },
      payload: {
        clientAnswerId: randomUUID(),
        sessionId: today.session.id,
        contentId: "js-arrow-this-004",
        answer: { kind: "selection", selectedOptionIds: ["a"] },
      },
    });

    expect(first.statusCode).toBe(201);
    expect(first.json()).toMatchObject({
      answer: { isCorrect: false, rating: "again" },
      review: { intervalDays: 1, streak: 0, lapses: 1 },
    });
    expect(second.statusCode).toBe(409);
    expect(second.json()).toEqual({ error: "ALREADY_ANSWERED" });
    expect(foreign.statusCode).toBe(404);
  });

  it("supports self-assessment and completes the session after all five items", async () => {
    const { app } = createTestApp();
    const guest = await createGuest(app);
    const today = await getToday(app, guest.guestToken);
    const headers = { "x-guest-token": guest.guestToken };

    for (const [index, item] of today.items.entries()) {
      const answer =
        item.type === "single_choice" || item.type === "multiple_choice"
          ? { kind: "selection" as const, selectedOptionIds: [item.options![0]!.id] }
          : { kind: "self_assessment" as const, rating: "easy" as const };
      const response = await app.inject({
        method: "POST",
        url: "/answers",
        headers,
        payload: {
          clientAnswerId: randomUUID(),
          sessionId: today.session.id,
          contentId: item.id,
          answer,
        },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().session.answered).toBe(index + 1);
      if (item.type === "term") {
        expect(response.json()).toMatchObject({
          answer: { isCorrect: null, rating: "easy" },
          review: { intervalDays: 4 },
        });
        expect(response.json().feedback.definition).toEqual(expect.any(String));
      }
    }

    const completed = await app.inject({ method: "GET", url: "/study/today", headers });
    expect(completed.json().session.status).toBe("completed");
  });

  it("validates the submission kind against the content type", async () => {
    const { app } = createTestApp();
    const guest = await createGuest(app);
    const today = await getToday(app, guest.guestToken);
    const response = await app.inject({
      method: "POST",
      url: "/answers",
      headers: { "x-guest-token": guest.guestToken },
      payload: {
        clientAnswerId: randomUUID(),
        sessionId: today.session.id,
        contentId: "js-closure-scope-001",
        answer: { kind: "selection", selectedOptionIds: ["a"] },
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "ANSWER_TYPE_MISMATCH" });
  });
});

describe("GET /stats", () => {
  it("requires a guest identity", async () => {
    const { app } = createTestApp();
    const response = await app.inject({ method: "GET", url: "/stats" });
    expect(response.statusCode).toBe(401);
  });

  it("returns an honest empty state for a new guest", async () => {
    const { app } = createTestApp();
    const guest = await createGuest(app);
    const response = await app.inject({
      method: "GET",
      url: "/stats",
      headers: { "x-guest-token": guest.guestToken },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().summary).toEqual({
      totalAnswers: 0,
      objectiveAnswers: 0,
      correctAnswers: 0,
      accuracy: null,
      completedSessions: 0,
      currentStreak: 0,
      dueReviews: 0,
      nextReviewAt: null,
    });
    expect(response.json().topics).toHaveLength(6);
    expect(response.json().activity).toHaveLength(7);
    expect(response.json().activity.every((day: { answers: number }) => day.answers === 0)).toBe(
      true,
    );
  });

  it("aggregates objective accuracy separately from self-assessment", async () => {
    const { app } = createTestApp();
    const guest = await createGuest(app);
    const today = await getToday(app, guest.guestToken);
    const headers = { "x-guest-token": guest.guestToken };

    const selfAssessment = await app.inject({
      method: "POST",
      url: "/answers",
      headers,
      payload: {
        clientAnswerId: randomUUID(),
        sessionId: today.session.id,
        contentId: "js-closure-scope-001",
        answer: { kind: "self_assessment", rating: "good" },
        latencyMs: 2_000,
      },
    });
    const objective = await app.inject({
      method: "POST",
      url: "/answers",
      headers,
      payload: {
        clientAnswerId: randomUUID(),
        sessionId: today.session.id,
        contentId: "js-array-map-003",
        answer: { kind: "selection", selectedOptionIds: ["a"] },
        latencyMs: 1_000,
      },
    });
    const stats = await app.inject({ method: "GET", url: "/stats", headers });
    const javascript = stats
      .json()
      .topics.find((topic: { topic: string }) => topic.topic === "javascript");

    expect(selfAssessment.statusCode).toBe(201);
    expect(objective.statusCode).toBe(201);
    expect(stats.statusCode).toBe(200);
    expect(stats.json().summary).toMatchObject({
      totalAnswers: 2,
      objectiveAnswers: 1,
      correctAnswers: 1,
      accuracy: 100,
      completedSessions: 0,
      currentStreak: 0,
      dueReviews: 0,
    });
    expect(stats.json().summary.nextReviewAt).toEqual(expect.any(String));
    expect(javascript).toMatchObject({
      attempts: 2,
      objectiveAttempts: 1,
      correctAnswers: 1,
      accuracy: 100,
      averageLatencyMs: 1_500,
    });
    expect(stats.json().activity.at(-1)).toMatchObject({ answers: 2, completed: false });
  });

  it("counts a completed daily session in the current streak", async () => {
    const { app } = createTestApp();
    const guest = await createGuest(app);
    const today = await getToday(app, guest.guestToken);
    const headers = { "x-guest-token": guest.guestToken };

    for (const item of today.items) {
      const answer =
        item.type === "single_choice" || item.type === "multiple_choice"
          ? { kind: "selection" as const, selectedOptionIds: [item.options![0]!.id] }
          : { kind: "self_assessment" as const, rating: "good" as const };
      const response = await app.inject({
        method: "POST",
        url: "/answers",
        headers,
        payload: {
          clientAnswerId: randomUUID(),
          sessionId: today.session.id,
          contentId: item.id,
          answer,
        },
      });
      expect(response.statusCode).toBe(201);
    }

    const stats = await app.inject({ method: "GET", url: "/stats", headers });
    expect(stats.json().summary).toMatchObject({
      totalAnswers: 5,
      completedSessions: 1,
      currentStreak: 1,
    });
    expect(stats.json().activity.at(-1)).toMatchObject({ answers: 5, completed: true });
  });
});

describe("mock interview API", () => {
  it("lists all sets without exposing reference points", async () => {
    const { app } = createTestApp();
    const guest = await createGuest(app);
    const response = await app.inject({
      method: "GET",
      url: "/mock-interviews",
      headers: { "x-guest-token": guest.guestToken },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().sets).toHaveLength(6);
    expect(response.json().sets.map((set: { title: string }) => set.title)).toEqual([
      "Frontend Core",
      "React",
      "JavaScript Deep Dive",
      "Browser",
      "Node basics",
      "React Native",
    ]);
    expect(response.body).not.toContain("referencePoints");
    expect(response.body).not.toContain("Runtime-схема проверяет");
  });

  it("saves notes, reveals the rubric and idempotently resumes the next question", async () => {
    const { app } = createTestApp();
    const guest = await createGuest(app);
    const headers = { "x-guest-token": guest.guestToken };
    const started = await app.inject({
      method: "POST",
      url: "/mock-interviews/sessions",
      headers,
      payload: { setId: "mock-react", durationMinutes: 30 },
    });
    const first = started.json();

    expect(started.statusCode).toBe(201);
    expect(first.session).toMatchObject({
      setId: "mock-react",
      title: "React",
      status: "active",
      durationMinutes: 30,
      currentQuestionIndex: 0,
      total: 5,
      assessedQuestions: 0,
      weakQuestions: 0,
    });
    expect(first.question).toMatchObject({ position: 1, total: 5, notes: "", revealed: false });
    expect(started.body).not.toContain("referencePoints");

    const activeReport = await app.inject({
      method: "GET",
      url: `/mock-interviews/sessions/${first.session.id}/report`,
      headers,
    });
    expect(activeReport.statusCode).toBe(409);
    expect(activeReport.json()).toEqual({ error: "MOCK_INTERVIEW_SESSION_ACTIVE" });
    const activePractice = await app.inject({
      method: "POST",
      url: `/mock-interviews/sessions/${first.session.id}/practice`,
      headers,
    });
    expect(activePractice.statusCode).toBe(409);
    expect(activePractice.json()).toEqual({ error: "MOCK_INTERVIEW_SESSION_ACTIVE" });

    const blocked = await app.inject({
      method: "POST",
      url: `/mock-interviews/sessions/${first.session.id}/next`,
      headers,
      payload: { questionId: first.question.id, rating: "good" },
    });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json()).toEqual({ error: "MOCK_INTERVIEW_REVIEW_REQUIRED" });

    const revealed = await app.inject({
      method: "POST",
      url: `/mock-interviews/sessions/${first.session.id}/reveal`,
      headers,
      payload: { questionId: first.question.id, notes: "React сравнивает type и стабильный key." },
    });
    const restoredReveal = await app.inject({
      method: "GET",
      url: `/mock-interviews/sessions/${first.session.id}`,
      headers,
    });
    expect(revealed.statusCode).toBe(200);
    expect(revealed.json().question).toMatchObject({
      notes: "React сравнивает type и стабильный key.",
      revealed: true,
      referencePoints: expect.any(Array),
    });
    expect(restoredReveal.json()).toEqual(revealed.json());

    const next = await app.inject({
      method: "POST",
      url: `/mock-interviews/sessions/${first.session.id}/next`,
      headers,
      payload: { questionId: first.question.id, rating: "good" },
    });
    const repeated = await app.inject({
      method: "POST",
      url: `/mock-interviews/sessions/${first.session.id}/next`,
      headers,
      payload: { questionId: first.question.id, rating: "good" },
    });
    const resumed = await app.inject({
      method: "GET",
      url: `/mock-interviews/sessions/${first.session.id}`,
      headers,
    });

    expect(next.json().question.position).toBe(2);
    expect(next.json().session).toMatchObject({ assessedQuestions: 1, weakQuestions: 0 });
    expect(repeated.json()).toEqual(next.json());
    expect(resumed.json()).toEqual(next.json());
    expect(next.body).not.toContain("referencePoints");
  });

  it("schedules related materials when self-assessment is weak", async () => {
    const { app, database } = createTestApp();
    const guest = await createGuest(app);
    const stranger = await createGuest(app);
    const headers = { "x-guest-token": guest.guestToken };
    const started = await app.inject({
      method: "POST",
      url: "/mock-interviews/sessions",
      headers,
      payload: { setId: "mock-react", durationMinutes: 15 },
    });
    const first = started.json();

    await app.inject({
      method: "POST",
      url: `/mock-interviews/sessions/${first.session.id}/reveal`,
      headers,
      payload: { questionId: first.question.id, notes: "Нужно повторить reconciliation." },
    });
    const next = await app.inject({
      method: "POST",
      url: `/mock-interviews/sessions/${first.session.id}/next`,
      headers,
      payload: { questionId: first.question.id, rating: "again" },
    });

    expect(next.statusCode).toBe(200);
    expect(next.json().session).toMatchObject({ assessedQuestions: 1, weakQuestions: 1 });
    const progress = await database.client.execute({
      sql: `SELECT content_id, interval_days, lapses
        FROM user_content_state
        WHERE user_id = ?
        ORDER BY content_id`,
      args: [guest.userId],
    });
    expect(progress.rows).toEqual([
      { content_id: "react-list-keys-002", interval_days: 1, lapses: 1 },
      { content_id: "react-reconciliation-001", interval_days: 1, lapses: 1 },
    ]);
    const assessment = await database.client.execute({
      sql: `SELECT notes, rating FROM mock_interview_question_assessments
        WHERE session_id = ? AND question_id = ?`,
      args: [first.session.id, first.question.id],
    });
    expect(assessment.rows[0]).toEqual({
      notes: "Нужно повторить reconciliation.",
      rating: "again",
    });

    const completed = await app.inject({
      method: "POST",
      url: `/mock-interviews/sessions/${first.session.id}/complete`,
      headers,
    });
    const history = await app.inject({
      method: "GET",
      url: "/mock-interviews/history",
      headers,
    });
    const report = await app.inject({
      method: "GET",
      url: `/mock-interviews/sessions/${first.session.id}/report`,
      headers,
    });
    const foreignReport = await app.inject({
      method: "GET",
      url: `/mock-interviews/sessions/${first.session.id}/report`,
      headers: { "x-guest-token": stranger.guestToken },
    });
    const practice = await app.inject({
      method: "POST",
      url: `/mock-interviews/sessions/${first.session.id}/practice`,
      headers,
    });
    const foreignPractice = await app.inject({
      method: "POST",
      url: `/mock-interviews/sessions/${first.session.id}/practice`,
      headers: { "x-guest-token": stranger.guestToken },
    });

    expect(completed.statusCode).toBe(200);
    expect(history.statusCode).toBe(200);
    expect(history.json().sessions).toEqual([
      expect.objectContaining({
        id: first.session.id,
        title: "React",
        completionReason: "manual",
        total: 5,
        assessedQuestions: 1,
        weakQuestions: 1,
      }),
    ]);
    expect(history.json().analytics.summary).toEqual({
      sessions: 1,
      assessedQuestions: 1,
      weakQuestions: 1,
      confidencePercent: 0,
    });
    expect(history.json().analytics.trend).toEqual([
      expect.objectContaining({
        sessionId: first.session.id,
        title: "React",
        assessedQuestions: 1,
        weakQuestions: 1,
        confidencePercent: 0,
      }),
    ]);
    expect(history.json().analytics.weakTopics).toEqual(
      expect.arrayContaining([
        { tag: "react", count: 1 },
        { tag: "reconciliation", count: 1 },
        { tag: "keys", count: 1 },
      ]),
    );
    expect(report.statusCode).toBe(200);
    expect(report.json().session).toEqual(history.json().sessions[0]);
    expect(report.json().questions).toEqual([
      expect.objectContaining({
        id: first.question.id,
        position: 1,
        notes: "Нужно повторить reconciliation.",
        rating: "again",
        scheduledForReview: true,
        referencePoints: expect.any(Array),
      }),
    ]);
    expect(report.body).not.toContain("relatedContentIds");
    expect(foreignReport.statusCode).toBe(404);
    expect(practice.statusCode).toBe(201);
    expect(practice.json().session).toMatchObject({ status: "pending", answered: 0, total: 2 });
    expect(practice.json().items.map((item: { id: string }) => item.id)).toEqual([
      "react-reconciliation-001",
      "react-list-keys-002",
    ]);
    expect(practice.json().items[0]).not.toHaveProperty("explanation");
    expect(foreignPractice.statusCode).toBe(404);
  });

  it("finishes after the last sequential question and rejects a foreign session", async () => {
    const { app } = createTestApp();
    const owner = await createGuest(app);
    const stranger = await createGuest(app);
    const ownerHeaders = { "x-guest-token": owner.guestToken };
    const started = await app.inject({
      method: "POST",
      url: "/mock-interviews/sessions",
      headers: ownerHeaders,
      payload: { setId: "mock-browser", durationMinutes: 15 },
    });
    let current = started.json();

    const foreign = await app.inject({
      method: "GET",
      url: `/mock-interviews/sessions/${current.session.id}`,
      headers: { "x-guest-token": stranger.guestToken },
    });
    expect(foreign.statusCode).toBe(404);

    while (current.question) {
      const reveal = await app.inject({
        method: "POST",
        url: `/mock-interviews/sessions/${current.session.id}/reveal`,
        headers: ownerHeaders,
        payload: { questionId: current.question.id, notes: "" },
      });
      expect(reveal.statusCode).toBe(200);
      const response = await app.inject({
        method: "POST",
        url: `/mock-interviews/sessions/${current.session.id}/next`,
        headers: ownerHeaders,
        payload: { questionId: current.question.id, rating: "good" },
      });
      expect(response.statusCode).toBe(200);
      current = response.json();
    }

    expect(current.session).toMatchObject({
      status: "completed",
      completionReason: "finished",
      currentQuestionIndex: 5,
    });
    expect(current.question).toBeNull();

    const noWeakPractice = await app.inject({
      method: "POST",
      url: `/mock-interviews/sessions/${current.session.id}/practice`,
      headers: ownerHeaders,
    });
    expect(noWeakPractice.statusCode).toBe(409);
    expect(noWeakPractice.json()).toEqual({ error: "MOCK_INTERVIEW_NO_WEAK_TOPICS" });

    const history = await app.inject({
      method: "GET",
      url: "/mock-interviews/history",
      headers: ownerHeaders,
    });
    expect(history.json().analytics).toMatchObject({
      summary: {
        sessions: 1,
        assessedQuestions: 5,
        weakQuestions: 0,
        confidencePercent: 100,
      },
      weakTopics: [],
    });
  });

  it("completes an expired session on the server", async () => {
    const { app, database } = createTestApp();
    const guest = await createGuest(app);
    const headers = { "x-guest-token": guest.guestToken };
    const started = await app.inject({
      method: "POST",
      url: "/mock-interviews/sessions",
      headers,
      payload: { setId: "mock-node-basics", durationMinutes: 15 },
    });
    const sessionId = started.json().session.id;
    await database.client.execute({
      sql: "UPDATE mock_interview_sessions SET ends_at = ? WHERE id = ?",
      args: [Date.now() - 1_000, sessionId],
    });

    const history = await app.inject({
      method: "GET",
      url: "/mock-interviews/history",
      headers,
    });
    const expired = await app.inject({
      method: "GET",
      url: `/mock-interviews/sessions/${sessionId}`,
      headers,
    });

    expect(history.statusCode).toBe(200);
    expect(history.json().sessions[0]).toMatchObject({
      id: sessionId,
      completionReason: "timeout",
    });
    expect(history.json().analytics.summary).toEqual({
      sessions: 1,
      assessedQuestions: 0,
      weakQuestions: 0,
      confidencePercent: null,
    });
    expect(expired.statusCode).toBe(200);
    expect(expired.json().session).toMatchObject({
      status: "completed",
      completionReason: "timeout",
    });
    expect(expired.json().question).toBeNull();
  });
});
