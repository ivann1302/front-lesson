import { describe, expect, it } from "vitest";

import { localMinute, millisecondsUntilNextMinute } from "./time";

describe("localMinute", () => {
  it("converts an instant to an IANA timezone and ISO weekday", () => {
    const now = new Date("2026-07-16T16:30:45.000Z");

    expect(localMinute(now, "Europe/Moscow")).toEqual({
      localDate: "2026-07-16",
      localTime: "19:30",
      weekday: 4,
    });
    expect(localMinute(now, "America/New_York")).toEqual({
      localDate: "2026-07-16",
      localTime: "12:30",
      weekday: 4,
    });
  });

  it("handles a local date crossing the UTC boundary", () => {
    expect(localMinute(new Date("2026-07-19T21:30:00.000Z"), "Europe/Moscow")).toEqual({
      localDate: "2026-07-20",
      localTime: "00:30",
      weekday: 1,
    });
  });

  it("skips an invalid timezone", () => {
    expect(localMinute(new Date(), "Moscow/Invalid")).toBeUndefined();
  });
});

describe("millisecondsUntilNextMinute", () => {
  it("aligns ticks to minute boundaries", () => {
    expect(millisecondsUntilNextMinute(12_345)).toBe(47_655);
    expect(millisecondsUntilNextMinute(60_000)).toBe(60_000);
  });
});
