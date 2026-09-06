import { prisma } from "./db";
import { getCurrentYear } from "./queries";
import { toDayKey, toISODate } from "./dates";
import { schoolClock } from "./school-time";
import type { AttendanceStatus } from "./constants";
import type { Sheet } from "./xlsx";
import type { T } from "./i18n";

/**
 * Student data for a supervisor working without a full sign-in.
 *
 * Everything here takes a supervisor and answers only for the classes that
 * supervisor is assigned to in the current academic year. That scoping is done
 * once, in `resolveDataScope`, and every other function takes the class ids it
 * produced — so a page, an export and a save cannot disagree about what a given
 * supervisor may see. A class id arriving in a request is filtered against that
 * list, never trusted.
 */

export type DataSupervisor = {
  id: string;
  firstName: string;
  lastName: string;
};

/**
 * The supervisors offered on the public page: active, and given a PIN by an
 * administrator. A supervisor without one does not appear, so this way in is
 * opt-in per person exactly as quick attendance is.
 */
export async function listPinSupervisors(): Promise<DataSupervisor[]> {
  return prisma.user.findMany({
    where: { role: "SUPERVISOR", isActive: true, quickPin: { not: null } },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: { id: true, firstName: true, lastName: true },
  });
}

/**
 * Re-reads the supervisor behind a session token, on every request.
 *
 * `quickPin: { not: null }` is what makes revocation immediate. An
 * administrator who clears the PIN is told they have "turned it off"; without
 * this check a device already holding a token keeps reading *and writing* the
 * class contact database for the rest of the eight-hour session. Deactivating
 * the account and changing their role end it here too.
 */
export async function findSupervisor(
  userId: string,
): Promise<DataSupervisor | null> {
  return prisma.user.findFirst({
    where: {
      id: userId,
      role: "SUPERVISOR",
      isActive: true,
      quickPin: { not: null },
    },
    select: { id: true, firstName: true, lastName: true },
  });
}

export type RosterStudent = {
  id: string;
  code: string;
  firstName: string;
  lastName: string;
  className: string;
  email: string | null;
  phone: string | null;
  phone2: string | null;
  phone3: string | null;
};

export type DataScope = {
  supervisor: DataSupervisor;
  /** Every class assigned to them in the current year: the whole menu. */
  classes: { id: string; name: string; level: string }[];
  /** The class chosen, after checking it is one of the above. */
  selectedClassId: string | null;
  /** The chosen class's roster, or empty when no class is chosen. */
  students: RosterStudent[];
  /** Every class id they may reach, for the exports that span all classes. */
  classIds: string[];
  yearName: string | null;
};

export async function resolveDataScope(
  supervisor: DataSupervisor,
  requestedClassId?: string | null,
): Promise<DataScope> {
  const year = await getCurrentYear();

  // Assigned classes, restricted to the current academic year. Without that
  // restriction last year's classes stay on the page forever.
  const links = await prisma.classSupervisor.findMany({
    where: {
      userId: supervisor.id,
      ...(year ? { class: { academicYearId: year.id } } : {}),
    },
    select: { class: { select: { id: true, name: true, level: true } } },
    orderBy: { class: { name: "asc" } },
  });
  const classes = links.map((link) => link.class);
  const classIds = classes.map((c) => c.id);

  // An id in the URL only counts if it is one of theirs, so a guessed or stale
  // one falls back to "no class chosen" rather than opening somebody else's.
  const selectedClassId =
    requestedClassId && classIds.includes(requestedClassId)
      ? requestedClassId
      : null;

  const students = selectedClassId ? await loadRoster([selectedClassId]) : [];

  return {
    supervisor,
    classes,
    selectedClassId,
    students,
    classIds,
    yearName: year?.name ?? null,
  };
}

/** The roster of one or more classes, ordered the way a class list is read. */
export async function loadRoster(
  classIds: string[],
  studentIds?: string[],
): Promise<RosterStudent[]> {
  if (classIds.length === 0) return [];
  const rows = await prisma.student.findMany({
    where: {
      classId: { in: classIds },
      isActive: true,
      // A student id list narrows the export; it can never widen it, because
      // the class filter above still applies.
      ...(studentIds && studentIds.length > 0 ? { id: { in: studentIds } } : {}),
    },
    orderBy: [
      { class: { name: "asc" } },
      { lastName: "asc" },
      { firstName: "asc" },
    ],
    select: {
      id: true,
      code: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      phone2: true,
      phone3: true,
      class: { select: { name: true } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    firstName: row.firstName,
    lastName: row.lastName,
    className: row.class?.name ?? "",
    email: row.email,
    phone: row.phone,
    phone2: row.phone2,
    phone3: row.phone3,
  }));
}

/**
 * The most recent observation per student, for the notes column of the student
 * list.
 *
 * "Observations" is the module Arabic calls الملاحظات, so that is what a notes
 * column on a student list means here: the last thing a teacher wrote about
 * them, not an empty column to fill in by hand.
 */
export async function latestNotes(
  studentIds: string[],
): Promise<Map<string, string>> {
  if (studentIds.length === 0) return new Map();

  // Bounded to the current academic year. Only the newest row per student is
  // kept, so without a bound this reads every observation ever written about
  // a few hundred children in order to produce a few hundred cells — and it
  // grows every year the school runs. Prisma's `distinct` would not help: it
  // is applied after the rows have already been fetched.
  const year = await getCurrentYear();
  const rows = await prisma.observation.findMany({
    where: {
      studentId: { in: studentIds },
      ...(year ? { date: { gte: year.startDate } } : {}),
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    select: { studentId: true, date: true, note: true },
  });
  const latest = new Map<string, string>();
  for (const row of rows) {
    // Ordered newest first, so the first one seen for a student is the one.
    if (latest.has(row.studentId)) continue;
    latest.set(row.studentId, `${toISODate(row.date)} - ${row.note}`);
  }
  return latest;
}

/* -------------------------------------------------------------------------- */
/*  Monthly attendance                                                        */
/* -------------------------------------------------------------------------- */

/** `month` is 1-12, not the 0-11 a JavaScript Date uses. */
export type MonthKey = { year: number; month: number };

/** "2026-09" to { year: 2026, month: 9 }, or null when it is not that. */
export function parseMonth(value: string | null | undefined): MonthKey | null {
  const match = /^(\d{4})-(\d{2})$/.exec((value ?? "").trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return { year, month };
}

export function monthKeyOf(date: Date): MonthKey {
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}

export function formatMonth({ year, month }: MonthKey): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function monthIndex({ year, month }: MonthKey): number {
  return year * 12 + (month - 1);
}

/** Every month from `from` to `to` inclusive. Empty when the range inverts. */
export function monthsBetween(from: MonthKey, to: MonthKey): MonthKey[] {
  const months: MonthKey[] = [];
  let cursor = monthIndex(from);
  const last = monthIndex(to);
  // A sheet per month, and a workbook of a hundred sheets is unusable. Two
  // academic years is already more than anyone asks a register for.
  while (cursor <= last && months.length < 24) {
    months.push({ year: Math.floor(cursor / 12), month: (cursor % 12) + 1 });
    cursor += 1;
  }
  return months;
}

export function daysInMonth({ year, month }: MonthKey): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** The first and last day of a month, as the UTC-midnight keys rows use. */
export function monthBounds(month: MonthKey): { from: Date; to: Date } {
  return {
    from: new Date(Date.UTC(month.year, month.month - 1, 1)),
    to: new Date(Date.UTC(month.year, month.month - 1, daysInMonth(month))),
  };
}

/**
 * The range of months a supervisor is offered, and the default selection: the
 * academic year so far. Nobody wants eight empty sheets for months the school
 * has not reached yet.
 */
export async function defaultMonthRange(): Promise<{
  from: MonthKey;
  to: MonthKey;
  earliest: MonthKey;
  latest: MonthKey;
}> {
  const year = await getCurrentYear();
  const todayKey = toDayKey(schoolClock().dateISO);
  const start = year ? monthKeyOf(year.startDate) : monthKeyOf(todayKey);
  const end = year ? monthKeyOf(year.endDate) : monthKeyOf(todayKey);
  const now = monthKeyOf(todayKey);

  return {
    from: start,
    // Up to today, but never past the end of the academic year.
    to: monthIndex(now) < monthIndex(end) ? now : end,
    earliest: start,
    latest: end,
  };
}

/** Clamps a requested month into the academic year, so a typed URL cannot ask
 *  for the year 3000 and get thirty-six empty sheets. */
export function clampMonth(
  value: MonthKey,
  earliest: MonthKey,
  latest: MonthKey,
): MonthKey {
  if (monthIndex(value) < monthIndex(earliest)) return earliest;
  if (monthIndex(value) > monthIndex(latest)) return latest;
  return value;
}

/** Short codes used in the day cells, so 31 columns stay narrow. */
export function statusCodes(t: T): Record<AttendanceStatus, string> {
  return {
    PRESENT: t("sd.code.PRESENT"),
    ABSENT: t("sd.code.ABSENT"),
    LATE: t("sd.code.LATE"),
    EXCUSED: t("sd.code.EXCUSED"),
  };
}

/**
 * The status of each student on each day of a range, keyed `studentId|ISO`.
 *
 * Two registers exist and they answer different questions, so this prefers the
 * one the sheet is about: the supervisor's own daily register. Only where a day
 * has no daily row does it fall back to the period registers, and then the
 * worst status recorded that day wins. A child away all morning who is marked
 * present in the last period was not present that day, and taking the last
 * period alone — which is how the classroom day grid picks a "final" status,
 * for a different purpose — would say they were.
 */
export async function attendanceByDay(
  classIds: string[],
  from: Date,
  to: Date,
): Promise<Map<string, AttendanceStatus>> {
  const result = new Map<string, AttendanceStatus>();
  if (classIds.length === 0) return result;

  const range = { gte: from, lte: to };

  const [daily, periodRows] = await Promise.all([
    prisma.attendance.findMany({
      where: { classId: { in: classIds }, date: range },
      select: { studentId: true, date: true, status: true },
    }),
    prisma.periodAttendance.findMany({
      where: { classId: { in: classIds }, date: range },
      select: { studentId: true, date: true, status: true },
    }),
  ]);

  const severity: Record<string, number> = {
    ABSENT: 4,
    EXCUSED: 3,
    LATE: 2,
    PRESENT: 1,
  };
  const fromPeriods = new Map<string, AttendanceStatus>();
  for (const row of periodRows) {
    const key = `${row.studentId}|${toISODate(row.date)}`;
    const current = fromPeriods.get(key);
    if (!current || severity[row.status] > severity[current]) {
      fromPeriods.set(key, row.status as AttendanceStatus);
    }
  }

  for (const [key, status] of fromPeriods) result.set(key, status);
  // Applied last, so the daily register wins wherever it exists.
  for (const row of daily) {
    result.set(
      `${row.studentId}|${toISODate(row.date)}`,
      row.status as AttendanceStatus,
    );
  }
  return result;
}

/**
 * One sheet per month: the students of every class down the side, the days of
 * that month across the top, and each student's absences for the month at the
 * end — which is the number the sheet exists to produce.
 */
export function buildMonthlySheets({
  students,
  months,
  byDay,
  t,
  caption,
}: {
  students: RosterStudent[];
  months: MonthKey[];
  byDay: Map<string, AttendanceStatus>;
  t: T;
  caption: (month: MonthKey) => string;
}): Sheet[] {
  const codes = statusCodes(t);

  return months.map((month) => {
    const total = daysInMonth(month);
    const days = Array.from({ length: total }, (_, i) => i + 1);

    const columns = [
      { header: t("sd.col.index"), key: "index", width: 7 },
      { header: t("sd.col.class"), key: "className", width: 14 },
      { header: t("sd.col.student"), key: "student", width: 26 },
      ...days.map((day) => ({
        header: String(day),
        key: `d${day}`,
        width: 4.5,
      })),
      { header: t("sd.col.absenceTotal"), key: "absences", width: 14 },
    ];

    const rows = students.map((student, index) => {
      const row: Record<string, string | number> = {
        index: index + 1,
        className: student.className,
        student: `${student.lastName} ${student.firstName}`,
      };
      let absences = 0;
      for (const day of days) {
        const iso = `${formatMonth(month)}-${String(day).padStart(2, "0")}`;
        const status = byDay.get(`${student.id}|${iso}`);
        row[`d${day}`] = status ? codes[status] : "";
        if (status === "ABSENT") absences += 1;
      }
      row.absences = absences;
      return row;
    });

    return { name: formatMonth(month), caption: caption(month), columns, rows };
  });
}

/* -------------------------------------------------------------------------- */
/*  Messages                                                                  */
/* -------------------------------------------------------------------------- */

export const PHONE_FIELDS = ["phone", "phone2", "phone3"] as const;
export type PhoneField = (typeof PHONE_FIELDS)[number];

export type MessageRow = { phone: string; message: string };

/**
 * The two-column sheet a bulk-SMS tool reads: a number, and the text to send
 * to it.
 *
 * A student's second and third numbers are not two more columns — they are more
 * rows under the same phone heading, each carrying that student's own message,
 * which is what makes the file usable as it stands. An identical
 * number-and-message pair is emitted once: a guardian whose number is recorded
 * twice on the same child should not be texted twice.
 */
export function buildMessageRows(
  students: RosterStudent[],
  options: {
    fields: PhoneField[];
    /** Named: the guardian is addressed by the child's name. */
    named: boolean;
    text: string;
    /** "{name}" is replaced with the student's full name. */
    namedTemplate: string;
  },
): { rows: MessageRow[]; skipped: RosterStudent[] } {
  const rows: MessageRow[] = [];
  const seen = new Set<string>();
  const skipped: RosterStudent[] = [];

  for (const student of students) {
    const name = `${student.lastName} ${student.firstName}`.trim();
    const message = options.named
      ? `${options.namedTemplate.replace("{name}", name)} ${options.text}`.trim()
      : options.text;

    let any = false;
    for (const field of options.fields) {
      const number = (student[field] ?? "").trim();
      if (!number) continue;
      any = true;
      const key = `${number} ${message}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ phone: number, message });
    }
    // Named and counted rather than dropped: a supervisor who exports 300 rows
    // for 320 students needs to know which twenty were left out, or the file
    // quietly means "we did not contact these families".
    if (!any) skipped.push(student);
  }

  return { rows, skipped };
}
