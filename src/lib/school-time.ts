/**
 * The school's wall clock.
 *
 * School days are stored as UTC midnight (see `dates.ts`), but "which period is
 * running right now" is a question about local time, and the server does not
 * run in the school's timezone — Render runs UTC. Asking `new Date()` for the
 * hour would put the school an hour or three off and unlock the wrong period.
 *
 * So every "now" that matters is resolved through `Intl` in `SCHOOL_TIMEZONE`,
 * and periods are stored as "HH:MM" wall-clock strings rather than instants:
 * a timetable is a fact about the clock on the wall, not about UTC, and it must
 * not shift when the clocks change.
 */

/** Override with SCHOOL_TIMEZONE to move the school without a code change. */
export const SCHOOL_TIMEZONE = process.env.SCHOOL_TIMEZONE || "Asia/Bahrain";

export type SchoolClock = {
  /** "YYYY-MM-DD" — the day the school is on, not the server's day. */
  dateISO: string;
  /** Minutes since local midnight. */
  minutes: number;
  /** "HH:MM" local time. */
  time: string;
  /** 0 = Sunday … 6 = Saturday, local. */
  weekday: number;
};

const formatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: SCHOOL_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  // h23 rather than hour12:false — some ICU builds render midnight as "24"
  // under hour12:false, which would put the school on the wrong day.
  hourCycle: "h23",
  weekday: "short",
});

const WEEKDAYS: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

/** The school's current date and time. */
export function schoolClock(now: Date = new Date()): SchoolClock {
  const parts = formatter.formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";

  const hour = Number(get("hour"));
  const minute = Number(get("minute"));

  return {
    dateISO: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: hour * 60 + minute,
    time: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
    weekday: WEEKDAYS[get("weekday")] ?? 0,
  };
}

/** "HH:MM" → minutes since midnight, or null when it is not a valid time. */
export function parseHHMM(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** Minutes since midnight → "HH:MM". */
export function formatHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export type PeriodLike = {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  isActive: boolean;
};

/** Chronological, which is the only order a timetable has. */
export function sortPeriods<T extends PeriodLike>(periods: T[]): T[] {
  return [...periods].sort(
    (a, b) =>
      (parseHHMM(a.startTime) ?? 0) - (parseHHMM(b.startTime) ?? 0) ||
      a.name.localeCompare(b.name),
  );
}

export type PeriodState = "before" | "live" | "after";

/**
 * Where `minutes` sits relative to one period. The end is exclusive so two
 * back-to-back periods can never both be live.
 */
export function periodState(period: PeriodLike, minutes: number): PeriodState {
  const start = parseHHMM(period.startTime);
  const end = parseHHMM(period.endTime);
  if (start === null || end === null) return "before";
  if (minutes < start) return "before";
  if (minutes >= end) return "after";
  return "live";
}

/** The period running at `minutes`, or null during a break / outside school. */
export function findLivePeriod<T extends PeriodLike>(
  periods: T[],
  minutes: number,
): T | null {
  return (
    sortPeriods(periods).find(
      (p) => p.isActive && periodState(p, minutes) === "live",
    ) ?? null
  );
}

/** The next period due to start after `minutes`, for the "starts at…" hint. */
export function findNextPeriod<T extends PeriodLike>(
  periods: T[],
  minutes: number,
): T | null {
  return (
    sortPeriods(periods).find((p) => {
      const start = parseHHMM(p.startTime);
      return p.isActive && start !== null && start > minutes;
    }) ?? null
  );
}

/** Minutes a period lasts, or null when either end is unparseable. */
export function periodLength(period: PeriodLike): number | null {
  const start = parseHHMM(period.startTime);
  const end = parseHHMM(period.endTime);
  if (start === null || end === null || end <= start) return null;
  return end - start;
}

/** True when two periods overlap — the timetable must never allow it. */
export function periodsOverlap(a: PeriodLike, b: PeriodLike): boolean {
  const aStart = parseHHMM(a.startTime);
  const aEnd = parseHHMM(a.endTime);
  const bStart = parseHHMM(b.startTime);
  const bEnd = parseHHMM(b.endTime);
  if (aStart === null || aEnd === null || bStart === null || bEnd === null) {
    return false;
  }
  return aStart < bEnd && bStart < aEnd;
}
