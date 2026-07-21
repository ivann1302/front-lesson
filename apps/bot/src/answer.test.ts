import { describe, expect, it, vi } from "vitest";

import { BotApiError } from "./api.js";
import { processAnswerCallback } from "./answer.js";

describe("Telegram answer callback", () => {
  it("shows correctness, explanation and progress", async () => {
    const submit = vi.fn(async () => ({
      answer: { isCorrect: true },
      feedback: { explanation: "map создаёт новый массив из возвращённых значений." },
      session: { status: "active" as const, answered: 3, total: 5 },
    }));
    const result = await processAnswerCallback("123456789", "answer:AbCdEfGh1234", submit);

    expect(submit).toHaveBeenCalledWith("123456789", "answer:AbCdEfGh1234");
    expect(result.text).toContain("✅ Верно");
    expect(result.text).toContain("Прогресс: 3 из 5");
    expect(result.showNextButton).toBe(true);
  });

  it("finishes the session without offering another question", async () => {
    const result = await processAnswerCallback("123456789", "answer:AbCdEfGh1234", async () => ({
      answer: { isCorrect: false },
      feedback: { explanation: "Правильный вариант объясняется здесь." },
      session: { status: "completed", answered: 5, total: 5 },
    }));

    expect(result.text).toContain("❌ Пока неверно");
    expect(result.text).toContain("Сессия завершена: 5 из 5");
    expect(result.showNextButton).toBe(false);
  });

  it("recovers from an expired button", async () => {
    const result = await processAnswerCallback("123456789", "answer:AbCdEfGh1234", async () => {
      throw new BotApiError("CALLBACK_EXPIRED", 410);
    });

    expect(result.text).toContain("устарела");
    expect(result.showNextButton).toBe(true);
  });

  it("does not reveal a callback owned by another profile", async () => {
    const result = await processAnswerCallback("123456789", "answer:AbCdEfGh1234", async () => {
      throw new BotApiError("CALLBACK_NOT_FOUND", 404);
    });

    expect(result.text).toContain("недоступна");
    expect(result.showAppButton).toBe(false);
  });
});
