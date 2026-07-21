const weekdayNumbers: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

export type LocalMinute = {
  localDate: string;
  localTime: string;
  weekday: number;
};

export function localMinute(now: Date, timezone: string): LocalMinute | undefined {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      weekday: "short",
      hourCycle: "h23",
    }).formatToParts(now);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const weekday = weekdayNumbers[values.weekday ?? ""];
    if (
      !values.year ||
      !values.month ||
      !values.day ||
      !values.hour ||
      !values.minute ||
      !weekday
    ) {
      return undefined;
    }

    return {
      localDate: `${values.year}-${values.month}-${values.day}`,
      localTime: `${values.hour}:${values.minute}`,
      weekday,
    };
  } catch {
    return undefined;
  }
}

export function millisecondsUntilNextMinute(nowMs = Date.now()): number {
  const remainder = nowMs % 60_000;
  return remainder === 0 ? 60_000 : 60_000 - remainder;
}
