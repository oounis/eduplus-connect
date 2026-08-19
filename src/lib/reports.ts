import { prisma } from "./db";
import { addDays, today, toDayKey, toISODate } from "./dates";
import { getCurrentYear, getVisibleClassIds } from "./queries";
import type { CurrentUser } from "./auth";

export type ReportScope = {
  from: Date;
  to: Date;
  fromISO: string;
  toISO: string;
  /** Every class the user may report on, for the picker. */
  classes: { id: string; name: string }[];
  /** The class filter in effect — one class, or all of the above. */
  selectedClassId: string | null;
  classIds: string[];
};

/**
 * Turns the ?from / ?to / ?classId query into a range and a class list the
 * user is actually allowed to see. Shared by the reports page and the CSV
 * export so the two can never disagree.
 */
export async function resolveReportScope(
  user: Pick<CurrentUser, "userId" | "role">,
  params: { from?: string; to?: string; classId?: string },
): Promise<ReportScope> {
  const to = params.to ? toDayKey(params.to) : today();
  const from = params.from ? toDayKey(params.from) : addDays(to, -29);

  const year = await getCurrentYear();
  const visible = await getVisibleClassIds(user);
  const classes = year
    ? await prisma.class.findMany({
        where: {
          academicYearId: year.id,
          ...(visible === "ALL" ? {} : { id: { in: visible } }),
        },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      })
    : [];

  const selectedClassId =
    params.classId && classes.some((c) => c.id === params.classId)
      ? params.classId
      : null;

  return {
    from: from.getTime() > to.getTime() ? to : from,
    to,
    fromISO: toISODate(from.getTime() > to.getTime() ? to : from),
    toISO: toISODate(to),
    classes,
    selectedClassId,
    classIds: selectedClassId ? [selectedClassId] : classes.map((c) => c.id),
  };
}

/** RFC 4180 escaping — a note containing a comma or quote must survive Excel. */
export function toCsv(header: string[], rows: (string | number | null)[][]) {
  const cell = (value: string | number | null) => {
    const text = value === null || value === undefined ? "" : String(value);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [header, ...rows]
    .map((row) => row.map(cell).join(","))
    .join("\r\n");
}
