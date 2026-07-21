export type TelegramReminder = {
  telegramUserId: string;
  dailyLimit: number;
};

type TelegramResponse = {
  ok?: boolean;
  error_code?: number;
  parameters?: { retry_after?: number };
};

export class TelegramSendError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number | undefined,
    public readonly retryAfterSeconds: number | undefined,
  ) {
    super(code);
    this.name = "TelegramSendError";
  }
}

export function createTelegramReminderSender(
  token: string,
  appUrl: string,
  fetchImplementation: typeof fetch = fetch,
) {
  return async ({ telegramUserId, dailyLimit }: TelegramReminder): Promise<void> => {
    let response: Response;
    try {
      response = await fetchImplementation(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: telegramUserId,
          text: `Пора к короткой тренировке. На сегодня — до ${dailyLimit} заданий.`,
          reply_markup: {
            inline_keyboard: [[{ text: "Начать", url: appUrl }]],
          },
        }),
      });
    } catch {
      throw new TelegramSendError("NETWORK_ERROR", undefined, undefined);
    }

    const body = (await response.json().catch(() => null)) as TelegramResponse | null;
    if (!response.ok || body?.ok !== true) {
      const status = body?.error_code ?? response.status;
      throw new TelegramSendError(`TELEGRAM_${status}`, status, body?.parameters?.retry_after);
    }
  };
}
