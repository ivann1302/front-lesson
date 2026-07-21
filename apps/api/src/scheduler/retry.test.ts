import { describe, expect, it } from "vitest";

import {
  classifyDeliveryError,
  MAX_DELIVERY_ATTEMPTS,
  RETRY_MAX_DELAY_MS,
  retryDelayMs,
} from "./retry";
import { TelegramSendError } from "./telegram";

describe("classifyDeliveryError", () => {
  it.each([undefined, 429, 500, 503])("retries a transient status: %s", (status) => {
    expect(
      classifyDeliveryError(
        new TelegramSendError(status ? `TELEGRAM_${status}` : "NETWORK_ERROR", status, undefined),
      ),
    ).toMatchObject({ retryable: true, disableChannel: false });
  });

  it.each([400, 403])("disables the channel for permanent Telegram status %s", (status) => {
    expect(
      classifyDeliveryError(new TelegramSendError(`TELEGRAM_${status}`, status, undefined)),
    ).toEqual({
      code: `TELEGRAM_${status}`,
      retryable: false,
      disableChannel: true,
    });
  });

  it("does not disable a channel for a systemic authentication error", () => {
    expect(
      classifyDeliveryError(new TelegramSendError("TELEGRAM_401", 401, undefined)),
    ).toMatchObject({ retryable: false, disableChannel: false });
  });

  it("treats an unknown sender error as transient", () => {
    expect(classifyDeliveryError(new Error("temporary failure"))).toEqual({
      code: "UNKNOWN_ERROR",
      retryable: true,
      disableChannel: false,
    });
  });
});

describe("retryDelayMs", () => {
  it("uses exponential delays for every delivery attempt", () => {
    expect(
      Array.from({ length: MAX_DELIVERY_ATTEMPTS }, (_, index) => retryDelayMs(index + 1)),
    ).toEqual([60_000, 120_000, 240_000, 480_000, 960_000]);
  });

  it("honors a longer Telegram retry_after", () => {
    expect(retryDelayMs(1, 180)).toBe(180_000);
  });

  it("caps exponential growth at one hour", () => {
    expect(retryDelayMs(20)).toBe(RETRY_MAX_DELAY_MS);
  });
});
