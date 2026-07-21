import { describe, expect, it, vi } from "vitest";

import { BotApiError } from "./api.js";
import { processToday } from "./today.js";

const pendingSession = {
  session: {
    id: "1f400d18-ea17-4f32-8184-5558e7868911",
    localDate: "2026-07-16",
    status: "active" as const,
    answered: 2,
    total: 5,
  },
  nextItem: {
    id: "js-array-map-003" as const,
    type: "single_choice" as const,
    topic: "javascript" as const,
    prompt: "Что выведет код в консоль?",
    estimatedSeconds: 80,
    options: [
      { text: "[1, 2, 3]", callbackData: "answer:AbCdEfGh1234" },
      { text: "[2, 4, 6]", callbackData: "answer:ZyXwVuTs9876" },
    ],
  },
};

describe("Telegram /today", () => {
  it("shows progress and the next pending item", async () => {
    const load = vi.fn(async () => pendingSession);
    const result = await processToday("123456789", load);

    expect(load).toHaveBeenCalledWith("123456789");
    expect(result.showAppButton).toBe(true);
    expect(result.text).toContain("Сегодня: 2 из 5");
    expect(result.text).toContain("Что выведет код в консоль?");
    expect(result.text).toContain("2 мин.");
    expect(result.options).toEqual(pendingSession.nextItem.options);
  });

  it("recognizes a completed daily session", async () => {
    const result = await processToday("123456789", async () => ({
      session: { ...pendingSession.session, status: "completed", answered: 5 },
      nextItem: null,
    }));

    expect(result.showAppButton).toBe(true);
    expect(result.text).toContain("всё выполнено: 5 из 5");
  });

  it("explains how to link an unknown Telegram identity", async () => {
    const result = await processToday("123456789", async () => {
      throw new BotApiError("TELEGRAM_IDENTITY_NOT_FOUND", 404);
    });

    expect(result.showAppButton).toBe(false);
    expect(result.text).toContain("/start КОД");
  });
});
