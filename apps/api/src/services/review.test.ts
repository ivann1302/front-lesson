import type { ReviewRating } from "@mentor/shared";
import { describe, expect, it } from "vitest";

import { calculateReview, MAX_REVIEW_INTERVAL_DAYS, type PreviousReview } from "./review";

const now = new Date("2026-07-16T12:00:00.000Z");
const previous: PreviousReview = {
  intervalDays: 10,
  ease: 2.5,
  streak: 4,
  lapses: 2,
};

describe("calculateReview", () => {
  it.each<[ReviewRating, number]>([
    ["again", 1],
    ["hard", 3],
    ["good", 1],
    ["easy", 4],
  ])("uses the initial %s interval", (rating, intervalDays) => {
    const review = calculateReview(null, rating, now);

    expect(review.intervalDays).toBe(intervalDays);
    expect(review.nextDueAt).toBe(
      new Date(now.getTime() + intervalDays * 86_400_000).toISOString(),
    );
  });

  it.each<[ReviewRating, number]>([
    ["again", 1],
    ["hard", 13],
    ["good", 22],
    ["easy", 32],
  ])("calculates the next %s interval", (rating, intervalDays) => {
    expect(calculateReview(previous, rating, now).intervalDays).toBe(intervalDays);
  });

  it("resets progress after again", () => {
    expect(calculateReview(previous, "again", now)).toMatchObject({
      ease: 2.3,
      streak: 0,
      lapses: 3,
    });
  });

  it("tracks difficulty without exceeding ease limits", () => {
    expect(calculateReview(previous, "hard", now)).toMatchObject({
      ease: 2.35,
      streak: 5,
      lapses: 2,
    });
    expect(calculateReview({ ...previous, ease: 1.3 }, "hard", now).ease).toBe(1.3);
    expect(calculateReview({ ...previous, ease: 3 }, "easy", now).ease).toBe(3);
  });

  it.each<ReviewRating>(["hard", "good", "easy"])("caps the %s interval at one year", (rating) => {
    const review = calculateReview(
      { ...previous, intervalDays: MAX_REVIEW_INTERVAL_DAYS },
      rating,
      now,
    );

    expect(review.intervalDays).toBe(MAX_REVIEW_INTERVAL_DAYS);
  });
});
