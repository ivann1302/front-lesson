import { describe, expect, it } from "vitest";

import { readSchedulerConfig } from "./config";

describe("readSchedulerConfig", () => {
  it("reads and normalizes scheduler variables", () => {
    expect(
      readSchedulerConfig({
        TELEGRAM_BOT_TOKEN: "123456:test-token",
        APP_URL: "https://mentor.example.com/",
      }),
    ).toEqual({
      token: "123456:test-token",
      appUrl: "https://mentor.example.com",
    });
  });

  it("requires the Telegram token", () => {
    expect(() => readSchedulerConfig({ APP_URL: "https://mentor.example.com" })).toThrow(
      "TELEGRAM_BOT_TOKEN is required",
    );
  });

  it("rejects a non-HTTP app URL", () => {
    expect(() =>
      readSchedulerConfig({ TELEGRAM_BOT_TOKEN: "token", APP_URL: "mentor.example.com" }),
    ).toThrow("APP_URL must be an absolute HTTP(S) URL");
  });
});
