import { describe, expect, it, vi } from "vitest";

import { BotApiError } from "./api.js";
import { normalizeStartCode, processStart } from "./start.js";

describe("Telegram /start", () => {
  it("normalizes a valid deep-link payload", () => {
    expect(normalizeStartCode("  abcd2345 ")).toBe("ABCD2345");
    expect(normalizeStartCode("contains-ambiguous-1")).toBeUndefined();
  });

  it("explains how to get a code when /start has no payload", async () => {
    const link = vi.fn();
    const result = await processStart(undefined, "123456789", link);

    expect(result.linked).toBe(false);
    expect(result.text).toContain("Настройки");
    expect(link).not.toHaveBeenCalled();
  });

  it("links the current Telegram user with the normalized code", async () => {
    const link = vi.fn(async (input: { code: string; telegramUserId: string }) => ({
      linked: true as const,
      userId: "1f400d18-ea17-4f32-8184-5558e7868911",
      telegramUserId: input.telegramUserId,
    }));
    const result = await processStart("abcd2345", "123456789", link);

    expect(result.linked).toBe(true);
    expect(link).toHaveBeenCalledWith({ code: "ABCD2345", telegramUserId: "123456789" });
    expect(result.text).toContain("Готово");
  });

  it("returns an actionable message for an expired code", async () => {
    const link = vi.fn(async () => {
      throw new BotApiError("LINK_CODE_EXPIRED", 410);
    });
    const result = await processStart("ABCD2345", "123456789", link);

    expect(result.linked).toBe(false);
    expect(result.text).toContain("истёк");
  });
});
