import type { ReviewRating } from "@mentor/shared";

export const MAX_REVIEW_INTERVAL_DAYS = 365;

export type ReviewSnapshot = {
  intervalDays: number;
  nextDueAt: string;
  ease: number;
  streak: number;
  lapses: number;
};

export type PreviousReview = {
  intervalDays: number;
  ease: number;
  streak: number;
  lapses: number;
};

function boundedInterval(days: number): number {
  return Math.min(MAX_REVIEW_INTERVAL_DAYS, Math.max(1, Math.round(days)));
}

export function calculateReview(
  previous: PreviousReview | null,
  rating: ReviewRating,
  now: Date,
): ReviewSnapshot {
  const before = previous ?? { intervalDays: 0, ease: 2.5, streak: 0, lapses: 0 };
  let intervalDays: number;
  let ease = before.ease;
  let streak = before.streak;
  let lapses = before.lapses;

  switch (rating) {
    case "again":
      intervalDays = 1;
      ease = Math.max(1.3, ease - 0.2);
      streak = 0;
      lapses += 1;
      break;
    case "hard":
      intervalDays = before.intervalDays === 0 ? 3 : before.intervalDays + 3;
      ease = Math.max(1.3, ease - 0.15);
      streak += 1;
      break;
    case "good":
      intervalDays = before.intervalDays === 0 ? 1 : before.intervalDays * 2.2;
      streak += 1;
      break;
    case "easy":
      intervalDays = before.intervalDays === 0 ? 4 : before.intervalDays * 3.2;
      ease = Math.min(3, ease + 0.15);
      streak += 1;
      break;
  }

  intervalDays = boundedInterval(intervalDays);
  const nextDueAt = new Date(now.getTime() + intervalDays * 86_400_000).toISOString();
  return { intervalDays, nextDueAt, ease, streak, lapses };
}
