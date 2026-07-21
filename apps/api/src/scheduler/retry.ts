import { TelegramSendError } from "./telegram.js";

export const MAX_DELIVERY_ATTEMPTS = 5;
export const RETRY_BASE_DELAY_MS = 60_000;
export const RETRY_MAX_DELAY_MS = 60 * 60_000;
export const DELIVERY_LEASE_MS = 10 * 60_000;

export type DeliveryFailure = {
  code: string;
  retryable: boolean;
  disableChannel: boolean;
  retryAfterSeconds?: number;
};

export function classifyDeliveryError(error: unknown): DeliveryFailure {
  if (!(error instanceof TelegramSendError)) {
    return { code: "UNKNOWN_ERROR", retryable: true, disableChannel: false };
  }

  const status = error.status;
  const retryable = status === undefined || status === 429 || status >= 500;
  return {
    code: error.code,
    retryable,
    disableChannel: status === 400 || status === 403,
    ...(error.retryAfterSeconds === undefined
      ? {}
      : { retryAfterSeconds: error.retryAfterSeconds }),
  };
}

export function retryDelayMs(attempts: number, retryAfterSeconds?: number): number {
  const exponential = Math.min(
    RETRY_MAX_DELAY_MS,
    RETRY_BASE_DELAY_MS * 2 ** Math.max(0, attempts - 1),
  );
  const requested = retryAfterSeconds === undefined ? 0 : retryAfterSeconds * 1_000;
  return Math.max(exponential, requested);
}
