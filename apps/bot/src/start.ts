import type { TelegramLinkRequest, TelegramLinkResponse } from "@mentor/shared";

import { BotApiError } from "./api.js";

export type StartResult = {
  linked: boolean;
  text: string;
};

export type LinkAccount = (input: TelegramLinkRequest) => Promise<TelegramLinkResponse>;

export function normalizeStartCode(payload: string | undefined): string | undefined {
  const code = payload?.trim().toUpperCase();
  return code && /^[A-HJ-NP-Z2-9]{8}$/.test(code) ? code : undefined;
}

function errorMessage(error: unknown): string {
  if (!(error instanceof BotApiError)) {
    return "Не удалось связаться с сервером. Попробуйте ещё раз чуть позже.";
  }

  switch (error.code) {
    case "LINK_CODE_EXPIRED":
      return "Код уже истёк. Получите новый код в настройках приложения.";
    case "LINK_CODE_USED":
      return "Этот код уже использован. Если нужна новая привязка, создайте другой код.";
    case "LINK_CODE_NOT_FOUND":
    case "VALIDATION_ERROR":
      return "Код не найден. Проверьте его или получите новый в настройках приложения.";
    case "TELEGRAM_ALREADY_LINKED":
      return "Этот Telegram-аккаунт уже связан с другим профилем.";
    case "USER_TELEGRAM_ALREADY_LINKED":
      return "К этому профилю уже привязан другой Telegram-аккаунт.";
    default:
      return "Привязка временно недоступна. Попробуйте ещё раз чуть позже.";
  }
}

export async function processStart(
  payload: string | undefined,
  telegramUserId: string,
  linkAccount: LinkAccount,
): Promise<StartResult> {
  const code = normalizeStartCode(payload);
  if (!code) {
    return {
      linked: false,
      text: "Привет! Получите код в разделе «Настройки» на сайте и отправьте /start КОД.",
    };
  }

  try {
    await linkAccount({ code, telegramUserId });
    return {
      linked: true,
      text: "Готово — Telegram связан с вашим учебным профилем. Теперь прогресс будет общим.",
    };
  } catch (error) {
    return { linked: false, text: errorMessage(error) };
  }
}
