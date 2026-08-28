import { prisma } from "./db";
import { addDays, toDayKey, toISODate } from "./dates";
import { getCurrentYear, getVisibleClassIds } from "./queries";
import {
  findLivePeriod,
  schoolClock,
  sortPeriods,
  type PeriodLike,
  type SchoolClock,
} from "./school-time";
import type { CurrentUser } from "./auth";
import type { AttendanceStatus, Role } from "./constants";

/** Every period, chronological. */
export async function getPeriods() {
  return sortPeriods(await prisma.period.findMany());
}

/* -------------------------------------------------------------------------- */
/*  Who may write, and why not                                                */
/* -------------------------------------------------------------------------- */

/**
 * Why a register is read-only. The page shows this instead of a silent
 * disabled form, because "I clicked save and nothing happened" is the failure
 * mode a teacher reports as "the app is broken".
 */
export type LockReason =
  | "no-right"
  | "no-periods"
  | "no-class"
  | "not-assigned"
  | "not-today"
  | "not-live";

export type WriteAccess =
  | { canWrite: true }
  | { canWrite: false; reason: LockReason };

/**
 * The rule the whole feature turns on.
 *
 * A teacher marks their own class, for today, while that period is actually
 * running — once it ends the register closes. Admin and deputy are the
 * escape hatch: they may correct any period on any day, and every correction
 * is written to the audit trail.
 */
export function resolvePeriodWriteAccess(input: {
  role: Role;
  hasEditRight: boolean;
  /** Is the acting user assigned to this class as a teacher? */
  isAssignedTeacher: boolean;
  hasPeriods: boolean;
  hasClass: boolean;
  /** Is the chosen day the school's today? */
  isToday: boolean;
  /** Is the chosen period the one running right now? */
  isLivePeriod: boolean;
}): WriteAccess {
  if (!input.hasEditRight) return { canWrite: false, reason: "no-right" };
  if (!input.hasPeriods) return { canWrite: false, reason: "no-periods" };
  if (!input.hasClass) return { canWrite: false, reason: "no-class" };

  // The fixers: leadership can correct a closed period.
  if (input.role === "ADMIN" || input.role === "DEPUTY") return { canWrite: true };

  if (input.role !== "TEACHER") return { canWrite: false, reason: "no-right" };
  if (!input.isAssignedTeacher) return { canWrite: false, reason: "not-assigned" };
  if (!input.isToday) return { canWrite: false, reason: "not-today" };
  if (!input.isLivePeriod) return { canWrite: false, reason: "not-live" };
  return { canWrite: true };
}

/* -------------------------------------------------------------------------- */
/*  The take-attendance page                                                  */
/* -------------------------------------------------------------------------- */

export type PeriodRosterStudent = {
  id: string;
  code: string;
  firstName: string;
  lastName: string;
  status: AttendanceStatus | null;
  note: string;
  recordedBy: string | null;
};

export type PeriodContext = {
  clock: SchoolClock;
  /** The school's today, as a UTC-midnight key. */
  todayKey: Date;
  dateISO: string;
  dateKey: Date;
  isToday: boolean;
  periods: PeriodLike[];
  livePeriod: PeriodLike | null;
  selectedPeriod: PeriodLike | null;
  teachers: { id: string; name: string }[];
  selectedTeacherId: string | null;
  classes: { id: string; name: string; level: string }[];
  selectedClassId: string | null;
  students: PeriodRosterStudent[];
  access: WriteAccess;
  /** Teachers may only ever look at their own timetable. */
  teacherPickerLocked: boolean;
};

/**
 * Everything `/period-attendance` needs, resolved in one place so the page and
 * the server action agree about what is writable.
 */
export async function getPeriodContext(
  user: Pick<CurrentUser, "userId" | "role" | "access">,
  params: {
    teacherId?: string;
    classId?: string;
    periodId?: string;
    date?: string;
  },
  now: Date = new Date(),
): Promise<PeriodContext> {
  const clock = schoolClock(now);
  const todayKey = toDayKey(clock.dateISO);

  const periods = await getPeriods();
  const livePeriod = findLivePeriod(periods, clock.minutes);

  // A teacher is pinned to their own timetable; everyone else may browse.
  const teacherPickerLocked = user.role === "TEACHER";

  const dateISO = params.date ?? clock.dateISO;
  const dateKey = toDayKey(dateISO);
  const isToday = dateKey.getTime() === todayKey.getTime();

  const selectedPeriod =
    periods.find((p) => p.id === params.periodId) ??
    livePeriod ??
    periods.find((p) => p.isActive) ??
    null;

  const teacherRows = teacherPickerLocked
    ? await prisma.user.findMany({
        where: { id: user.userId },
        select: { id: true, firstName: true, lastName: true },
      })
    : await prisma.user.findMany({
        where: { role: "TEACHER", isActive: true },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        select: { id: true, firstName: true, lastName: true },
      });
  const teachers = teacherRows.map((t) => ({
    id: t.id,
    name: `${t.firstName} ${t.lastName}`,
  }));

  const selectedTeacherId = teacherPickerLocked
    ? user.userId
    : teachers.some((t) => t.id === params.teacherId)
      ? params.teacherId!
      : (teachers[0]?.id ?? null);

  const year = await getCurrentYear();
  const classRows =
    selectedTeacherId && year
      ? await prisma.classTeacher.findMany({
          where: {
            userId: selectedTeacherId,
            class: { academicYearId: year.id },
          },
          orderBy: { class: { name: "asc" } },
          select: { class: { select: { id: true, name: true, level: true } } },
        })
      : [];
  const classes = classRows.map((row) => row.class);

  const selectedClassId = classes.some((c) => c.id === params.classId)
    ? params.classId!
    : (classes[0]?.id ?? null);

  let students: PeriodRosterStudent[] = [];
  if (selectedClassId && selectedPeriod) {
    const [roster, existing] = await Promise.all([
      prisma.student.findMany({
        where: { classId: selectedClassId, isActive: true },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        select: { id: true, code: true, firstName: true, lastName: true },
      }),
      prisma.periodAttendance.findMany({
        where: {
          classId: selectedClassId,
          date: dateKey,
          periodId: selectedPeriod.id,
        },
        include: {
          recordedBy: { select: { firstName: true, lastName: true } },
        },
      }),
    ]);
    const byStudent = new Map(existing.map((row) => [row.studentId, row]));
    students = roster.map((student) => {
      const record = byStudent.get(student.id);
      return {
        ...student,
        status: (record?.status as AttendanceStatus) ?? null,
        note: record?.note ?? "",
        recordedBy: record
          ? `${record.recordedBy.firstName} ${record.recordedBy.lastName}`
          : null,
      };
    });
  }

  // A teacher may only write as themselves, for a class they are assigned to.
  const isAssignedTeacher =
    selectedTeacherId === user.userId &&
    Boolean(selectedClassId) &&
    classes.some((c) => c.id === selectedClassId);

  const access = resolvePeriodWriteAccess({
    role: user.role as Role,
    hasEditRight: Boolean(user.access.periodAttendance?.edit),
    isAssignedTeacher,
    hasPeriods: periods.length > 0,
    hasClass: Boolean(selectedClassId),
    isToday,
    isLivePeriod: Boolean(
      selectedPeriod && livePeriod && selectedPeriod.id === livePeriod.id,
    ),
  });

  return {
    clock,
    todayKey,
    dateISO,
    dateKey,
    isToday,
    periods,
    livePeriod,
    selectedPeriod,
    teachers,
    selectedTeacherId,
    classes,
    selectedClassId,
    students,
    access,
    teacherPickerLocked,
  };
}

/* -------------------------------------------------------------------------- */
/*  Reports                                                                   */
/* -------------------------------------------------------------------------- */

export type PeriodReportScope = {
  from: Date;
  to: Date;
  fromISO: string;
  toISO: string;
  /** Every class the user may report on. */
  classes: { id: string; name: string; level: string }[];
  /** The classes actually selected — all of the above when none were picked. */
  classIds: string[];
  selectedClassIds: string[];
  periods: PeriodLike[];
  periodIds: string[];
  selectedPeriodIds: string[];
};

/** `?classId=a&classId=b` arrives as a string or an array — normalise both. */
function asList(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return (Array.isArray(value) ? value : [value]).filter(Boolean);
}

/**
 * Turns the report query into a range, a class list and a period list the user
 * is allowed to see. Shared by the page and the Excel export so the two can
 * never disagree about scope.
 */
export async function resolvePeriodReportScope(
  user: Pick<CurrentUser, "userId" | "role">,
  params: {
    from?: string;
    to?: string;
    classId?: string | string[];
    periodId?: string | string[];
  },
): Promise<PeriodReportScope> {
  const to = params.to ? toDayKey(params.to) : toDayKey(schoolClock().dateISO);
  const from = params.from ? toDayKey(params.from) : addDays(to, -13);
  const [start, end] = from.getTime() > to.getTime() ? [to, from] : [from, to];

  const year = await getCurrentYear();
  const visible = await getVisibleClassIds(user);
  const classes = year
    ? await prisma.class.findMany({
        where: {
          academicYearId: year.id,
          ...(visible === "ALL" ? {} : { id: { in: visible } }),
        },
        orderBy: { name: "asc" },
        select: { id: true, name: true, level: true },
      })
    : [];

  const periods = await getPeriods();

  // An id the user may not see is dropped rather than widening the scope.
  const requestedClasses = asList(params.classId).filter((id) =>
    classes.some((c) => c.id === id),
  );
  const requestedPeriods = asList(params.periodId).filter((id) =>
    periods.some((p) => p.id === id),
  );

  return {
    from: start,
    to: end,
    fromISO: toISODate(start),
    toISO: toISODate(end),
    classes,
    classIds: requestedClasses.length
      ? requestedClasses
      : classes.map((c) => c.id),
    selectedClassIds: requestedClasses,
    periods,
    periodIds: requestedPeriods.length
      ? requestedPeriods
      : periods.map((p) => p.id),
    selectedPeriodIds: requestedPeriods,
  };
}

export type PeriodTotals = {
  present: number;
  absent: number;
  late: number;
  excused: number;
  recorded: number;
  rate: number | null;
};

export function emptyTotals(): PeriodTotals {
  return { present: 0, absent: 0, late: 0, excused: 0, recorded: 0, rate: null };
}

function tally(counts: Record<string, number>): PeriodTotals {
  const present = counts.PRESENT ?? 0;
  const absent = counts.ABSENT ?? 0;
  const late = counts.LATE ?? 0;
  const excused = counts.EXCUSED ?? 0;
  const recorded = present + absent + late + excused;
  return {
    present,
    absent,
    late,
    excused,
    recorded,
    // Late still counts as attending — the student is in the room.
    rate: recorded > 0 ? ((present + late) / recorded) * 100 : null,
  };
}

export type PeriodBreakdownRow = PeriodTotals & {
  key: string;
  periodId: string;
  periodName: string;
  startTime: string;
  endTime: string;
  classId?: string;
  className?: string;
  dateISO?: string;
};

/**
 * Attendance aggregated by period, and by the combinations the report offers:
 * period × class, and period × day. One query, grouped three ways in memory —
 * the alternative is three round trips that can disagree.
 */
export async function getPeriodReport(scope: PeriodReportScope) {
  if (scope.classIds.length === 0 || scope.periodIds.length === 0) {
    return { byPeriod: [], byPeriodClass: [], byDayPeriod: [], totals: emptyTotals() };
  }

  const grouped = await prisma.periodAttendance.groupBy({
    by: ["periodId", "classId", "date", "status"],
    where: {
      date: { gte: scope.from, lte: scope.to },
      classId: { in: scope.classIds },
      periodId: { in: scope.periodIds },
    },
    _count: { _all: true },
  });

  const periodById = new Map(scope.periods.map((p) => [p.id, p]));
  const classById = new Map(scope.classes.map((c) => [c.id, c]));

  const byPeriod = new Map<string, Record<string, number>>();
  const byPeriodClass = new Map<string, Record<string, number>>();
  const byDayPeriod = new Map<string, Record<string, number>>();
  const overall: Record<string, number> = {};

  for (const row of grouped) {
    const n = row._count._all;
    const dateISO = toISODate(row.date);
    const add = (map: Map<string, Record<string, number>>, key: string) => {
      const entry = map.get(key) ?? {};
      entry[row.status] = (entry[row.status] ?? 0) + n;
      map.set(key, entry);
    };
    add(byPeriod, row.periodId);
    add(byPeriodClass, `${row.periodId}::${row.classId}`);
    add(byDayPeriod, `${dateISO}::${row.periodId}`);
    overall[row.status] = (overall[row.status] ?? 0) + n;
  }

  const periodRow = (periodId: string): Omit<PeriodBreakdownRow, keyof PeriodTotals | "key"> => {
    const period = periodById.get(periodId);
    return {
      periodId,
      periodName: period?.name ?? "—",
      startTime: period?.startTime ?? "",
      endTime: period?.endTime ?? "",
    };
  };

  const sortKey = (periodId: string) =>
    scope.periods.findIndex((p) => p.id === periodId);

  return {
    byPeriod: [...byPeriod.entries()]
      .map(([periodId, counts]) => ({
        key: periodId,
        ...periodRow(periodId),
        ...tally(counts),
      }))
      .sort((a, b) => sortKey(a.periodId) - sortKey(b.periodId)),

    byPeriodClass: [...byPeriodClass.entries()]
      .map(([key, counts]) => {
        const [periodId, classId] = key.split("::");
        return {
          key,
          ...periodRow(periodId),
          classId,
          className: classById.get(classId)?.name ?? "—",
          ...tally(counts),
        };
      })
      .sort(
        (a, b) =>
          sortKey(a.periodId) - sortKey(b.periodId) ||
          (a.className ?? "").localeCompare(b.className ?? ""),
      ),

    byDayPeriod: [...byDayPeriod.entries()]
      .map(([key, counts]) => {
        const [dateISO, periodId] = key.split("::");
        return {
          key,
          dateISO,
          ...periodRow(periodId),
          ...tally(counts),
        };
      })
      .sort(
        (a, b) =>
          (b.dateISO ?? "").localeCompare(a.dateISO ?? "") ||
          sortKey(a.periodId) - sortKey(b.periodId),
      ),

    totals: tally(overall),
  };
}

/** Every record behind the report, for the Excel detail sheet. */
export async function getPeriodRecords(scope: PeriodReportScope) {
  if (scope.classIds.length === 0 || scope.periodIds.length === 0) return [];
  return prisma.periodAttendance.findMany({
    where: {
      date: { gte: scope.from, lte: scope.to },
      classId: { in: scope.classIds },
      periodId: { in: scope.periodIds },
    },
    orderBy: [{ date: "desc" }, { classId: "asc" }],
    include: {
      student: { select: { code: true, firstName: true, lastName: true } },
      class: { select: { name: true, level: true } },
      period: { select: { name: true, startTime: true, endTime: true } },
      recordedBy: { select: { firstName: true, lastName: true } },
    },
  });
}
