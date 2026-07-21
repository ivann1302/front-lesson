import { setTimeout as delay } from "node:timers/promises";

import { Bot } from "grammy";
import { describe, expect, it } from "vitest";

import { buildWebhookServer } from "./webhook.js";

const botInfo = {
  id: 1,
  is_bot: true as const,
  first_name: "Test",
  username: "test_bot",
  can_join_groups: true,
  can_read_all_group_messages: false,
  supports_inline_queries: false,
  can_connect_to_business: false,
  has_main_web_app: false,
  has_topics_enabled: false,
  allows_users_to_create_topics: false,
  can_manage_bots: false,
  supports_join_request_queries: false,
};

function createTestBot(): Bot {
  return new Bot("123456:test-token", { botInfo });
}

function messageUpdate(text: string) {
  return {
    update_id: 1,
    message: {
      message_id: 1,
      date: 1_700_000_000,
      chat: { id: 42, type: "private", first_name: "Ivan" },
      from: { id: 42, is_bot: false, first_name: "Ivan" },
      text,
    },
  };
}

describe("buildWebhookServer", () => {
  it("exposes a healthcheck", async () => {
    const app = buildWebhookServer(createTestBot(), {
      path: "/telegram/webhook",
      secretToken: "valid_secret",
    });

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok", mode: "webhook" });
    await app.close();
  });

  it.each([undefined, "wrong_secret"])("rejects an update with secret %s", async (secretToken) => {
    const bot = createTestBot();
    let received = false;
    bot.on("message:text", () => {
      received = true;
    });
    const app = buildWebhookServer(bot, {
      path: "/telegram/webhook",
      secretToken: "valid_secret",
    });

    const response = await app.inject({
      method: "POST",
      url: "/telegram/webhook",
      ...(secretToken ? { headers: { "x-telegram-bot-api-secret-token": secretToken } } : {}),
      payload: messageUpdate("hello"),
    });

    expect(response.statusCode).toBe(401);
    expect(received).toBe(false);
    await app.close();
  });

  it("accepts an update with the configured secret", async () => {
    const bot = createTestBot();
    let received = "";
    bot.on("message:text", (context) => {
      received = context.message.text;
    });
    const app = buildWebhookServer(bot, {
      path: "/telegram/webhook",
      secretToken: "valid_secret",
    });

    const response = await app.inject({
      method: "POST",
      url: "/telegram/webhook",
      headers: { "x-telegram-bot-api-secret-token": "valid_secret" },
      payload: messageUpdate("hello"),
    });

    expect(response.statusCode).toBe(200);
    expect(received).toBe("hello");
    await app.close();
  });

  it("acknowledges a slow update before its handler finishes", async () => {
    const bot = createTestBot();
    let handled = false;
    bot.on("message:text", async () => {
      await delay(30);
      handled = true;
    });
    const app = buildWebhookServer(bot, {
      path: "/telegram/webhook",
      secretToken: "valid_secret",
      timeoutMilliseconds: 5,
    });

    const response = await app.inject({
      method: "POST",
      url: "/telegram/webhook",
      headers: { "x-telegram-bot-api-secret-token": "valid_secret" },
      payload: messageUpdate("slow"),
    });

    expect(response.statusCode).toBe(200);
    expect(handled).toBe(false);
    await delay(40);
    expect(handled).toBe(true);
    await app.close();
  });
});
