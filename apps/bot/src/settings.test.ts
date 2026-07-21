import type { BotSettingsResponse } from "@mentor/shared";
import { describe, expect, it, vi } from "vitest";

import { BotApiError } from "./api.js";
import { formatSettings, parsePauseAction, processPause, processSettings } from "./settings.js";

const settings: BotSettingsResponse = {
  topics: ["typescript", "react"],
  dailyLimit: 3,
  localTime: "09:15",
  timezone: "Europe/Moscow",
  weekdays: [1, 2, 3, 4, 5],
  channel: "telegram" as const,
  pausedUntil: null,
};

describe("Telegram settings", () => {
  it("formats the shared learning schedule", () => {
    const result = formatSettings(settings);

    expect(result.showControls).toBe(true);
    expect(result.paused).toBe(false);
    expect(result.text).toContain("TypeScript, React");
    expect(result.text).toContain("Заданий в день: 3");
    expect(result.text).toContain("09:15 · Europe/Moscow");
    expect(result.text).toContain("Пн, Вт, Ср, Чт, Пт");
  });

  it("parses pause command shortcuts", () => {
    expect(parsePauseAction("1d")).toBe("day");
    expect(parsePauseAction("7")).toBe("week");
    expect(parsePauseAction("off")).toBe("resume");
    expect(parsePauseAction("unknown")).toBeUndefined();
  });

  it("updates pause state and reports the result", async () => {
    const update = vi.fn(async () => ({
      ...settings,
      pausedUntil: "2099-07-17T12:00:00.000Z",
    }));
    const result = await processPause("123456789", "day", update);

    expect(update).toHaveBeenCalledWith("123456789", "day");
    expect(result.text).toContain("Пауза сохранена");
    expect(result.paused).toBe(true);
  });

  it("explains linking when the Telegram identity is unknown", async () => {
    const result = await processSettings("123456789", async () => {
      throw new BotApiError("TELEGRAM_IDENTITY_NOT_FOUND", 404);
    });

    expect(result.showControls).toBe(false);
    expect(result.text).toContain("/start КОД");
  });
});
