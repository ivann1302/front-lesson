import type { BotTodayResponse, Topic } from "@mentor/shared";

import { BotApiError } from "./api.js";

const topicLabels: Record<Topic, string> = {
  javascript: "JavaScript",
  typescript: "TypeScript",
  react: "React",
  browser: "Browser",
  node: "Node.js",
  css: "CSS",
};

export type TodayResult = {
  text: string;
  showAppButton: boolean;
  options?: { text: string; callbackData: string }[];
};

export type LoadToday = (telegramUserId: string) => Promise<BotTodayResponse>;

export async function processToday(
  telegramUserId: string,
  loadToday: LoadToday,
): Promise<TodayResult> {
  try {
    const today = await loadToday(telegramUserId);
    const { answered, total, status } = today.session;

    if (status === "completed" || (total > 0 && answered === total)) {
      return {
        showAppButton: true,
        text: `На сегодня всё выполнено: ${answered} из ${total}. Отличная работа!`,
      };
    }

    if (!today.nextItem) {
      return {
        showAppButton: true,
        text: "На сегодня заданий нет. Можно выбрать материал в разделе «Обучение».",
      };
    }

    const minutes = Math.max(1, Math.ceil(today.nextItem.estimatedSeconds / 60));
    return {
      showAppButton: true,
      text: [
        `Сегодня: ${answered} из ${total}`,
        `Следующее · ${topicLabels[today.nextItem.topic]}`,
        today.nextItem.prompt,
        `Примерное время: ${minutes} мин.`,
      ].join("\n\n"),
      ...(today.nextItem.type === "single_choice" && today.nextItem.options?.length
        ? { options: today.nextItem.options }
        : {}),
    };
  } catch (error) {
    if (error instanceof BotApiError && error.code === "TELEGRAM_IDENTITY_NOT_FOUND") {
      return {
        showAppButton: false,
        text: "Сначала свяжите Telegram с профилем: получите код в настройках сайта и отправьте /start КОД.",
      };
    }

    return {
      showAppButton: false,
      text: "Не удалось загрузить задания на сегодня. Попробуйте ещё раз чуть позже.",
    };
  }
}
