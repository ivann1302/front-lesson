import { describe, expect, it } from "vitest";

import {
  BotApiError,
  linkTelegramAccount,
  loadTelegramSettings,
  loadTelegramToday,
  submitTelegramAnswer,
  updateTelegramPause,
} from "./api.js";

const config = {
  apiUrl: "http://localhost:3000",
  internalSecret: "test-telegram-internal-secret-value",
};

describe("bot API client", () => {
  it("authenticates the internal linking request", async () => {
    let capturedRequest: RequestInit | undefined;
    const fetchMock: typeof fetch = async (_input, request) => {
      capturedRequest = request;
      return Response.json({
        linked: true,
        userId: "1f400d18-ea17-4f32-8184-5558e7868911",
        telegramUserId: "123456789",
      });
    };
    const result = await linkTelegramAccount(
      config,
      { code: "ABCD2345", telegramUserId: "123456789" },
      fetchMock,
    );

    expect(result.linked).toBe(true);
    expect(capturedRequest?.method).toBe("POST");
    expect(new Headers(capturedRequest?.headers).get("x-telegram-internal-secret")).toBe(
      config.internalSecret,
    );
  });

  it("preserves an API error code for the command handler", async () => {
    const fetchMock: typeof fetch = async () =>
      Response.json({ error: "LINK_CODE_USED" }, { status: 410 });

    await expect(
      linkTelegramAccount(config, { code: "ABCD2345", telegramUserId: "123456789" }, fetchMock),
    ).rejects.toEqual(new BotApiError("LINK_CODE_USED", 410));
  });

  it("loads a validated daily session for the current Telegram user", async () => {
    let capturedBody = "";
    const fetchMock: typeof fetch = async (_input, request) => {
      capturedBody = String(request?.body ?? "");
      return Response.json({
        session: {
          id: "1f400d18-ea17-4f32-8184-5558e7868911",
          localDate: "2026-07-16",
          status: "pending",
          answered: 0,
          total: 5,
        },
        nextItem: {
          id: "js-closure-scope-001",
          type: "flashcard",
          topic: "javascript",
          prompt: "Что такое замыкание в JavaScript?",
          estimatedSeconds: 60,
        },
      });
    };

    const today = await loadTelegramToday(config, "123456789", fetchMock);

    expect(today.session.total).toBe(5);
    expect(today.nextItem?.id).toBe("js-closure-scope-001");
    expect(JSON.parse(capturedBody)).toEqual({ telegramUserId: "123456789" });
  });

  it("submits an opaque Telegram callback", async () => {
    let capturedBody = "";
    const fetchMock: typeof fetch = async (_input, request) => {
      capturedBody = String(request?.body ?? "");
      return Response.json(
        {
          answer: { isCorrect: true },
          feedback: { explanation: "map возвращает новый массив." },
          session: { status: "active", answered: 3, total: 5 },
        },
        { status: 201 },
      );
    };

    const result = await submitTelegramAnswer(
      config,
      "123456789",
      "answer:AbCdEfGh1234",
      fetchMock,
    );

    expect(result.answer.isCorrect).toBe(true);
    expect(JSON.parse(capturedBody)).toEqual({
      telegramUserId: "123456789",
      callbackData: "answer:AbCdEfGh1234",
    });
  });

  it("loads settings and updates the notification pause", async () => {
    const requests: { url: string; body: unknown }[] = [];
    const fetchMock: typeof fetch = async (input, request) => {
      requests.push({ url: String(input), body: JSON.parse(String(request?.body)) });
      return Response.json({
        topics: ["react"],
        dailyLimit: 3,
        localTime: "09:15",
        timezone: "Europe/Moscow",
        weekdays: [1, 2, 3, 4, 5],
        channel: "telegram",
        pausedUntil: String(input).endsWith("/pause") ? "2026-07-17T09:15:00.000Z" : null,
      });
    };

    const settings = await loadTelegramSettings(config, "123456789", fetchMock);
    const paused = await updateTelegramPause(config, "123456789", "day", fetchMock);

    expect(settings.dailyLimit).toBe(3);
    expect(paused.pausedUntil).toBe("2026-07-17T09:15:00.000Z");
    expect(requests).toEqual([
      {
        url: "http://localhost:3000/bot/settings",
        body: { telegramUserId: "123456789" },
      },
      {
        url: "http://localhost:3000/bot/settings/pause",
        body: { telegramUserId: "123456789", action: "day" },
      },
    ]);
  });
});
