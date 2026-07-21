import { describe, expect, it, vi } from "vitest";

import { createTelegramReminderSender, TelegramSendError } from "./telegram";

describe("createTelegramReminderSender", () => {
  it("sends a reminder with an app button", async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, result: {} }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const send = createTelegramReminderSender(
      "123456:test-token",
      "https://mentor.example.com",
      fetchImplementation,
    );

    await send({ telegramUserId: "987654321", dailyLimit: 5 });

    expect(fetchImplementation).toHaveBeenCalledOnce();
    const [url, request] = fetchImplementation.mock.calls[0]!;
    expect(url).toBe("https://api.telegram.org/bot123456:test-token/sendMessage");
    expect(JSON.parse(String(request?.body))).toEqual({
      chat_id: "987654321",
      text: "Пора к короткой тренировке. На сегодня — до 5 заданий.",
      reply_markup: {
        inline_keyboard: [[{ text: "Начать", url: "https://mentor.example.com" }]],
      },
    });
  });

  it("returns a structured Telegram error", async () => {
    const send = createTelegramReminderSender(
      "123456:test-token",
      "https://mentor.example.com",
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ ok: false, error_code: 429, parameters: { retry_after: 4 } }),
            { status: 429 },
          ),
        ),
    );

    await expect(send({ telegramUserId: "1", dailyLimit: 3 })).rejects.toEqual(
      new TelegramSendError("TELEGRAM_429", 429, 4),
    );
  });

  it("does not expose the token in a network error", async () => {
    const send = createTelegramReminderSender(
      "123456:secret-token",
      "https://mentor.example.com",
      vi.fn<typeof fetch>().mockRejectedValue(new Error("network down")),
    );

    await expect(send({ telegramUserId: "1", dailyLimit: 3 })).rejects.toMatchObject({
      code: "NETWORK_ERROR",
      message: "NETWORK_ERROR",
    });
  });
});
