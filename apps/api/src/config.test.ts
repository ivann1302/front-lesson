import { describe, expect, it } from "vitest";

import { readApiConfig } from "./config.js";

describe("readApiConfig", () => {
  it("uses safe single-process development defaults", () => {
    expect(readApiConfig({ NODE_ENV: "development" })).toEqual({
      host: "0.0.0.0",
      port: 3000,
      trustProxy: false,
      databaseUrl: "./data/mentor.db",
      telegramInternalSecret: undefined,
    });
  });

  it("validates an explicit production configuration", () => {
    expect(
      readApiConfig({
        NODE_ENV: "production",
        HOST: "127.0.0.1",
        PORT: "3100",
        TRUST_PROXY_HOPS: "1",
        DATABASE_URL: "/srv/frontend-mentor/data/mentor.db",
        TELEGRAM_INTERNAL_SECRET: "production-internal-secret-value-123",
      }),
    ).toEqual({
      host: "127.0.0.1",
      port: 3100,
      trustProxy: 1,
      databaseUrl: "/srv/frontend-mentor/data/mentor.db",
      telegramInternalSecret: "production-internal-secret-value-123",
    });
  });

  it.each([
    ["PORT", "0", "PORT must be an integer between 1 and 65535"],
    ["PORT", "3000.5", "PORT must be an integer between 1 and 65535"],
    ["TRUST_PROXY_HOPS", "11", "TRUST_PROXY_HOPS must be an integer between 0 and 10"],
  ])("rejects invalid %s=%s", (name, value, message) => {
    expect(() => readApiConfig({ NODE_ENV: "development", [name]: value })).toThrow(message);
  });

  it("requires persistent storage and the internal secret in production", () => {
    expect(() => readApiConfig({ NODE_ENV: "production" })).toThrow(
      "DATABASE_URL is required in production",
    );
    expect(() => readApiConfig({ NODE_ENV: "production", DATABASE_URL: ":memory:" })).toThrow(
      "DATABASE_URL must be persistent in production",
    );
    expect(() =>
      readApiConfig({
        NODE_ENV: "production",
        DATABASE_URL: "/srv/mentor.db",
      }),
    ).toThrow("TELEGRAM_INTERNAL_SECRET is required in production");
  });

  it("rejects a configured internal secret that is too short", () => {
    expect(() =>
      readApiConfig({ NODE_ENV: "development", TELEGRAM_INTERNAL_SECRET: "short" }),
    ).toThrow("TELEGRAM_INTERNAL_SECRET must contain at least 32 characters");
  });
});
