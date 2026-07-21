import { describe, expect, it } from "vitest";

import { readBotConfig } from "./config.js";

const baseEnv: NodeJS.ProcessEnv = {
  NODE_ENV: "development",
  TELEGRAM_BOT_TOKEN: "123456:test-token",
  TELEGRAM_INTERNAL_SECRET: "test-telegram-internal-secret-value",
  API_URL: "http://localhost:3000/",
  APP_URL: "http://localhost:5173/",
};

describe("readBotConfig", () => {
  it("uses polling outside production", () => {
    expect(readBotConfig(baseEnv)).toEqual({
      mode: "polling",
      token: "123456:test-token",
      internalSecret: "test-telegram-internal-secret-value",
      apiUrl: "http://localhost:3000",
      appUrl: "http://localhost:5173",
    });
  });

  it("uses a validated webhook configuration in production", () => {
    expect(
      readBotConfig({
        ...baseEnv,
        NODE_ENV: "production",
        TELEGRAM_WEBHOOK_URL: "https://bot.example.com/telegram/webhook",
        TELEGRAM_WEBHOOK_SECRET: "webhook_secret-123",
        BOT_HOST: "127.0.0.1",
        BOT_PORT: "8443",
      }),
    ).toEqual({
      mode: "webhook",
      token: "123456:test-token",
      internalSecret: "test-telegram-internal-secret-value",
      apiUrl: "http://localhost:3000",
      appUrl: "http://localhost:5173",
      webhookUrl: "https://bot.example.com/telegram/webhook",
      webhookPath: "/telegram/webhook",
      webhookSecret: "webhook_secret-123",
      webhookHost: "127.0.0.1",
      webhookPort: 8443,
    });
  });

  it("requires webhook variables in production", () => {
    expect(() => readBotConfig({ ...baseEnv, NODE_ENV: "production" })).toThrow(
      "TELEGRAM_WEBHOOK_URL is required",
    );
  });

  it.each([
    "http://bot.example.com/telegram/webhook",
    "https://bot.example.com/",
    "https://bot.example.com/telegram/webhook?token=secret",
  ])("rejects an unsafe webhook URL: %s", (webhookUrl) => {
    expect(() =>
      readBotConfig({
        ...baseEnv,
        NODE_ENV: "production",
        TELEGRAM_WEBHOOK_URL: webhookUrl,
        TELEGRAM_WEBHOOK_SECRET: "webhook_secret-123",
      }),
    ).toThrow("TELEGRAM_WEBHOOK_URL must be an absolute HTTPS URL");
  });

  it("rejects an invalid webhook secret", () => {
    expect(() =>
      readBotConfig({
        ...baseEnv,
        NODE_ENV: "production",
        TELEGRAM_WEBHOOK_URL: "https://bot.example.com/telegram/webhook",
        TELEGRAM_WEBHOOK_SECRET: "invalid secret",
      }),
    ).toThrow("TELEGRAM_WEBHOOK_SECRET must contain 1-256 characters");
  });

  it("does not allow polling in production", () => {
    expect(() =>
      readBotConfig({ ...baseEnv, NODE_ENV: "production", BOT_MODE: "polling" }),
    ).toThrow("Polling is only allowed outside production");
  });
});
