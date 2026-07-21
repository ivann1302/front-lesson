import type { BotPauseAction } from "@mentor/shared";
import { Bot, InlineKeyboard, type Context } from "grammy";

import {
  linkTelegramAccount,
  loadTelegramSettings,
  loadTelegramToday,
  submitTelegramAnswer,
  updateTelegramPause,
} from "./api.js";
import { processAnswerCallback } from "./answer.js";
import type { BotConfig } from "./config.js";
import { processStart } from "./start.js";
import { parsePauseAction, processPause, processSettings } from "./settings.js";
import { processToday } from "./today.js";

function optionLabel(text: string): string {
  return text.length <= 48 ? text : `${text.slice(0, 47)}…`;
}

async function sendToday(context: Context, config: BotConfig): Promise<void> {
  const telegramUserId = context.from?.id;
  if (!telegramUserId) {
    await context.reply("Не удалось определить Telegram-аккаунт. Откройте бота в личном чате.");
    return;
  }

  const result = await processToday(String(telegramUserId), (userId) =>
    loadTelegramToday(config, userId),
  );
  if (!result.showAppButton) {
    await context.reply(result.text);
    return;
  }

  const keyboard = new InlineKeyboard();
  for (const option of result.options ?? []) {
    keyboard.text(optionLabel(option.text), option.callbackData).row();
  }
  keyboard.url("Открыть сессию", config.appUrl);
  await context.reply(result.text, { reply_markup: keyboard });
}

function settingsKeyboard(paused: boolean, appUrl: string): InlineKeyboard {
  const keyboard = new InlineKeyboard()
    .text("Пауза на 1 день", "pause:day")
    .text("На 7 дней", "pause:week")
    .row();
  if (paused) keyboard.text("Возобновить", "pause:resume").row();
  return keyboard.url("Настройки на сайте", appUrl);
}

async function sendSettings(
  context: Context,
  config: BotConfig,
  action?: BotPauseAction,
): Promise<void> {
  const telegramUserId = context.from?.id;
  if (!telegramUserId) {
    await context.reply("Не удалось определить Telegram-аккаунт. Откройте бота в личном чате.");
    return;
  }

  const userId = String(telegramUserId);
  const result = action
    ? await processPause(userId, action, (id, pauseAction) =>
        updateTelegramPause(config, id, pauseAction),
      )
    : await processSettings(userId, (id) => loadTelegramSettings(config, id));
  await context.reply(result.text, {
    ...(result.showControls
      ? { reply_markup: settingsKeyboard(result.paused, config.appUrl) }
      : {}),
  });
}

export function createMentorBot(config: BotConfig): Bot {
  const bot = new Bot(config.token);

  bot.command("start", async (context) => {
    const telegramUserId = context.from?.id;
    if (!telegramUserId) {
      await context.reply("Не удалось определить Telegram-аккаунт. Откройте бота в личном чате.");
      return;
    }

    const result = await processStart(
      String(context.match || ""),
      String(telegramUserId),
      (input) => linkTelegramAccount(config, input),
    );

    if (result.linked) {
      await context.reply(result.text, {
        reply_markup: new InlineKeyboard().url("Открыть приложение", config.appUrl),
      });
      return;
    }

    await context.reply(result.text);
  });

  bot.command("today", async (context) => {
    await sendToday(context, config);
  });

  bot.command("settings", async (context) => {
    await sendSettings(context, config);
  });

  bot.command("pause", async (context) => {
    await sendSettings(context, config, parsePauseAction(String(context.match || "")));
  });

  bot.callbackQuery(/^answer:/, async (context) => {
    const telegramUserId = context.from.id;
    await context.answerCallbackQuery({ text: "Проверяем ответ…" });
    const result = await processAnswerCallback(
      String(telegramUserId),
      context.callbackQuery.data,
      (userId, callbackData) => submitTelegramAnswer(config, userId, callbackData),
    );

    await context
      .editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } })
      .catch(() => undefined);
    const keyboard = new InlineKeyboard();
    if (result.showNextButton) keyboard.text("Следующий вопрос", "today").row();
    if (result.showAppButton) keyboard.url("Открыть сессию", config.appUrl);
    await context.reply(result.text, {
      ...(result.showNextButton || result.showAppButton ? { reply_markup: keyboard } : {}),
    });
  });

  bot.callbackQuery("today", async (context) => {
    await context.answerCallbackQuery();
    await sendToday(context, config);
  });

  bot.callbackQuery(/^pause:/, async (context) => {
    const action = parsePauseAction(context.callbackQuery.data.slice("pause:".length));
    await context.answerCallbackQuery();
    if (!action) {
      await context.reply("Неизвестный режим паузы.");
      return;
    }
    await sendSettings(context, config, action);
  });

  return bot;
}
