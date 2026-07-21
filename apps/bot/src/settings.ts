import type { BotPauseAction, BotSettingsResponse, Topic } from "@mentor/shared";

import { BotApiError } from "./api.js";

const topicLabels: Record<Topic, string> = {
  javascript: "JavaScript",
  typescript: "TypeScript",
  react: "React",
  browser: "Browser",
  node: "Node.js",
  css: "CSS",
};

const weekdayLabels: Record<number, string> = {
  1: "Пн",
  2: "Вт",
  3: "Ср",
  4: "Чт",
  5: "Пт",
  6: "Сб",
  7: "Вс",
};

export type SettingsResult = {
  text: string;
  showControls: boolean;
  paused: boolean;
};

export function parsePauseAction(payload: string | undefined): BotPauseAction | undefined {
  switch (payload?.trim().toLowerCase()) {
    case "1":
    case "1d":
    case "day":
      return "day";
    case "7":
    case "7d":
    case "week":
      return "week";
    case "off":
    case "on":
    case "resume":
      return "resume";
    default:
      return undefined;
  }
}

export function formatSettings(settings: BotSettingsResponse, now = new Date()): SettingsResult {
  const pausedUntil = settings.pausedUntil ? new Date(settings.pausedUntil) : null;
  const paused = Boolean(pausedUntil && pausedUntil.getTime() > now.getTime());
  const pauseStatus =
    pausedUntil && paused
      ? `пауза до ${new Intl.DateTimeFormat("ru-RU", {
          dateStyle: "medium",
          timeStyle: "short",
          timeZone: settings.timezone,
        }).format(pausedUntil)}`
      : "активны";

  return {
    showControls: true,
    paused,
    text: [
      "Настройки обучения",
      `Темы: ${settings.topics.map((topic) => topicLabels[topic]).join(", ")}`,
      `Заданий в день: ${settings.dailyLimit}`,
      `Напоминание: ${settings.localTime} · ${settings.timezone}`,
      `Дни: ${settings.weekdays.map((day) => weekdayLabels[day] ?? day).join(", ")}`,
      `Уведомления: ${pauseStatus}`,
    ].join("\n"),
  };
}

function settingsError(error: unknown): SettingsResult {
  if (error instanceof BotApiError && error.code === "TELEGRAM_IDENTITY_NOT_FOUND") {
    return {
      showControls: false,
      paused: false,
      text: "Сначала свяжите Telegram с профилем через /start КОД.",
    };
  }
  return {
    showControls: false,
    paused: false,
    text: "Не удалось загрузить настройки. Попробуйте ещё раз чуть позже.",
  };
}

export async function processSettings(
  telegramUserId: string,
  loadSettings: (telegramUserId: string) => Promise<BotSettingsResponse>,
): Promise<SettingsResult> {
  try {
    return formatSettings(await loadSettings(telegramUserId));
  } catch (error) {
    return settingsError(error);
  }
}

export async function processPause(
  telegramUserId: string,
  action: BotPauseAction,
  updatePause: (telegramUserId: string, action: BotPauseAction) => Promise<BotSettingsResponse>,
): Promise<SettingsResult> {
  try {
    const result = formatSettings(await updatePause(telegramUserId, action));
    const prefix = action === "resume" ? "Уведомления возобновлены." : "Пауза сохранена.";
    return { ...result, text: `${prefix}\n\n${result.text}` };
  } catch (error) {
    return settingsError(error);
  }
}
