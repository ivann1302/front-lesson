import {
  botAnswerResponseSchema,
  botSettingsResponseSchema,
  botTodayResponseSchema,
  telegramLinkResponseSchema,
  type BotAnswerResponse,
  type BotPauseAction,
  type BotSettingsResponse,
  type BotTodayResponse,
  type TelegramLinkRequest,
  type TelegramLinkResponse,
} from "@mentor/shared";

export class BotApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
  ) {
    super(code);
    this.name = "BotApiError";
  }
}

export type LinkApiConfig = {
  apiUrl: string;
  internalSecret: string;
};

export async function linkTelegramAccount(
  config: LinkApiConfig,
  input: TelegramLinkRequest,
  fetchImplementation: typeof fetch = fetch,
): Promise<TelegramLinkResponse> {
  const response = await fetchImplementation(`${config.apiUrl}/auth/telegram-link`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-telegram-internal-secret": config.internalSecret,
    },
    body: JSON.stringify(input),
  });
  const body = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    const error = body as { error?: string } | null;
    throw new BotApiError(error?.error ?? "API_REQUEST_FAILED", response.status);
  }

  const parsed = telegramLinkResponseSchema.safeParse(body);
  if (!parsed.success) throw new BotApiError("INVALID_API_RESPONSE", 502);
  return parsed.data;
}

export async function loadTelegramToday(
  config: LinkApiConfig,
  telegramUserId: string,
  fetchImplementation: typeof fetch = fetch,
): Promise<BotTodayResponse> {
  const response = await fetchImplementation(`${config.apiUrl}/bot/study/today`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-telegram-internal-secret": config.internalSecret,
    },
    body: JSON.stringify({ telegramUserId }),
  });
  const body = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    const error = body as { error?: string } | null;
    throw new BotApiError(error?.error ?? "API_REQUEST_FAILED", response.status);
  }

  const parsed = botTodayResponseSchema.safeParse(body);
  if (!parsed.success) throw new BotApiError("INVALID_API_RESPONSE", 502);
  return parsed.data;
}

export async function submitTelegramAnswer(
  config: LinkApiConfig,
  telegramUserId: string,
  callbackData: string,
  fetchImplementation: typeof fetch = fetch,
): Promise<BotAnswerResponse> {
  const response = await fetchImplementation(`${config.apiUrl}/bot/answers`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-telegram-internal-secret": config.internalSecret,
    },
    body: JSON.stringify({ telegramUserId, callbackData }),
  });
  const body = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    const error = body as { error?: string } | null;
    throw new BotApiError(error?.error ?? "API_REQUEST_FAILED", response.status);
  }

  const parsed = botAnswerResponseSchema.safeParse(body);
  if (!parsed.success) throw new BotApiError("INVALID_API_RESPONSE", 502);
  return parsed.data;
}

export async function loadTelegramSettings(
  config: LinkApiConfig,
  telegramUserId: string,
  fetchImplementation: typeof fetch = fetch,
): Promise<BotSettingsResponse> {
  const response = await fetchImplementation(`${config.apiUrl}/bot/settings`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-telegram-internal-secret": config.internalSecret,
    },
    body: JSON.stringify({ telegramUserId }),
  });
  const body = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    const error = body as { error?: string } | null;
    throw new BotApiError(error?.error ?? "API_REQUEST_FAILED", response.status);
  }

  const parsed = botSettingsResponseSchema.safeParse(body);
  if (!parsed.success) throw new BotApiError("INVALID_API_RESPONSE", 502);
  return parsed.data;
}

export async function updateTelegramPause(
  config: LinkApiConfig,
  telegramUserId: string,
  action: BotPauseAction,
  fetchImplementation: typeof fetch = fetch,
): Promise<BotSettingsResponse> {
  const response = await fetchImplementation(`${config.apiUrl}/bot/settings/pause`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-telegram-internal-secret": config.internalSecret,
    },
    body: JSON.stringify({ telegramUserId, action }),
  });
  const body = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    const error = body as { error?: string } | null;
    throw new BotApiError(error?.error ?? "API_REQUEST_FAILED", response.status);
  }

  const parsed = botSettingsResponseSchema.safeParse(body);
  if (!parsed.success) throw new BotApiError("INVALID_API_RESPONSE", 502);
  return parsed.data;
}
