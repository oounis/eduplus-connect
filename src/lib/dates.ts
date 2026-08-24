/**
 * All school days are stored as UTC midnight so that a day key is stable
 * regardless of the server timezone.
 */
export function toDayKey(date: Date | string): Date {
  const d = typeof date === "string" ? new Date(`${date}T00:00:00.000Z`) : date;
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0),
  );
}

/** Today, as a UTC-midnight day key. */
export function today(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0),
  );
}

/** "YYYY-MM-DD" for <input type="date"> and URL params. */
export function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Monday 00:00 UTC of the week containing `date`. */
export function startOfWeek(date: Date): Date {
  const d = toDayKey(date);
  const day = d.getUTCDay(); // 0 = Sunday
  const diff = day === 0 ? 6 : day - 1;
  d.setUTCDate(d.getUTCDate() - diff);
  return d;
}

/** Sunday 00:00 UTC of the week containing `date`. */
export function endOfWeek(date: Date): Date {
  const start = startOfWeek(date);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  return end;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/**
 * Dates follow the interface language. Arabic uses ar-EG with Latin digits —
 * `ar` alone would render Eastern Arabic numerals (٢٠٢٦), which do not match
 * the Latin figures used everywhere else in the tables and read badly beside
 * them. `-u-nu-latn` keeps the numerals Western while the month and weekday
 * names translate.
 */
function intlLocale(locale?: string): string {
  return locale === "ar" ? "ar-EG-u-nu-latn" : "en-GB";
}

export function formatDate(date: Date, locale?: string): string {
  return date.toLocaleDateString(intlLocale(locale), {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatShortDate(date: Date, locale?: string): string {
  return date.toLocaleDateString(intlLocale(locale), {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  });
}
