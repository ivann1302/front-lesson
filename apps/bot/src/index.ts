import type { BotCommand } from "grammy/types";

import { createMentorBot } from "./bot.js";
import { readBotConfig, type BotConfig, type WebhookBotConfig } from "./config.js";
import { buildWebhookServer } from "./webhook.js";

const commands: BotCommand[] = [
  { command: "start", description: "Открыть бота или связать профиль" },
  { command: "today", description: "Показать задания на сегодня" },
  { command: "settings", description: "Показать учебное расписание" },
  { command: "pause", description: "Приостановить или возобновить уведомления" },
];

async function startPolling(config: BotConfig): Promise<void> {
  if (config.mode !== "polling") throw new Error("Polling configuration expected");

  const bot = createMentorBot(config);
  const shutdown = () => void bot.stop();
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  await bot.api.setMyCommands(commands);
  await bot.start({
    onStart: ({ username }) => console.log(`Telegram bot @${username} started in polling mode`),
  });
}

async function startWebhook(config: WebhookBotConfig): Promise<void> {
  const bot = createMentorBot(config);
  await bot.init();
  await bot.api.setMyCommands(commands);

  const app = buildWebhookServer(bot, {
    path: config.webhookPath,
    secretToken: config.webhookSecret,
    logger: true,
  });
  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    await app.close();
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  try {
    await app.listen({ host: config.webhookHost, port: config.webhookPort });
    await bot.api.setWebhook(config.webhookUrl, {
      secret_token: config.webhookSecret,
      drop_pending_updates: false,
    });
    app.log.info({ username: bot.botInfo.username }, "Telegram bot started in webhook mode");
  } catch (error) {
    process.removeListener("SIGINT", shutdown);
    process.removeListener("SIGTERM", shutdown);
    await app.close();
    throw error;
  }
}

const config = readBotConfig();
if (config.mode === "webhook") {
  await startWebhook(config);
} else {
  await startPolling(config);
}
