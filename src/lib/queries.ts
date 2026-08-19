import { prisma } from "./db";
import { endOfWeek, startOfWeek } from "./dates";
import type { CurrentUser } from "./auth";
import type { AttendanceStatus, Role } from "./constants";

export async function getCurrentYear() {
  return (
    (await prisma.academicYear.findFirst({ where: { isCurrent: true } })) ??
    (await prisma.academicYear.findFirst({ orderBy: { startDate: "desc" } }))
  );
}

/**
 * The classes a user is responsible for.
 * ADMIN / DEPUTY / STAFF see every class of the current year; supervisors and
 * teachers see only the classes assigned to them.
 */
export async function getVisibleClassIds(
  user: Pick<CurrentUser, "userId" | "role">,
): Promise<string[] | "ALL"> {
  const role = user.role as Role;
  if (role === "ADMIN" || role === "DEPUTY" || role === "STAFF") return "ALL";

  if (role === "SUPERVISOR") {
    const rows = await prisma.classSupervisor.findMany({
      where: { userId: user.userId },
      select: { classId: true },
    });
    return rows.map((r) => r.classId);
  }
  if (role === "TEACHER") {
    const rows = await prisma.classTeacher.findMany({
      where: { userId: user.userId },
      select: { classId: true },
    });
    return rows.map((r) => r.classId);
  }
  if (role === "PARENT") {
    const rows = await prisma.student.findMany({
      where: { parentId: user.userId, classId: { not: null } },
      select: { classId: true },
    });
    return [...new Set(rows.map((r) => r.classId!))];
  }
  if (role === "STUDENT") {
    const student = await prisma.student.findUnique({
      where: { userId: user.userId },
      select: { classId: true },
    });
    return student?.classId ? [student.classId] : [];
  }
  return [];
}

export type ClassAttendanceRow = {
  classId: string;
  className: string;
  level: string;
  enrolled: number;
  present: number;
  absent: number;
  late: number;
  excused: number;
  recorded: number;
  taken: boolean;
  rate: number | null; // present+late as a share of recorded
};

/** Attendance summary for one day, one row per class. */
export async function getAttendanceSummaryForDay(
  date: Date,
  classIds?: string[] | "ALL",
): Promise<ClassAttendanceRow[]> {
  const year = await getCurrentYear();
  if (!year) return [];

  const classes = await prisma.class.findMany({
    where: {
      academicYearId: year.id,
      ...(classIds && classIds !== "ALL" ? { id: { in: classIds } } : {}),
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      level: true,
      _count: { select: { students: true } },
    },
  });
  if (classes.length === 0) return [];

  const grouped = await prisma.attendance.groupBy({
    by: ["classId", "status"],
    where: { date, classId: { in: classes.map((c) => c.id) } },
    _count: { _all: true },
  });

  const byClass = new Map<string, Record<string, number>>();
  for (const row of grouped) {
    const entry = byClass.get(row.classId) ?? {};
    entry[row.status] = row._count._all;
    byClass.set(row.classId, entry);
  }

  return classes.map((klass) => {
    const counts = byClass.get(klass.id) ?? {};
    const present = counts.PRESENT ?? 0;
    const absent = counts.ABSENT ?? 0;
    const late = counts.LATE ?? 0;
    const excused = counts.EXCUSED ?? 0;
    const recorded = present + absent + late + excused;
    return {
      classId: klass.id,
      className: klass.name,
      level: klass.level,
      enrolled: klass._count.students,
      present,
      absent,
      late,
      excused,
      recorded,
      taken: recorded > 0,
      rate: recorded > 0 ? ((present + late) / recorded) * 100 : null,
    };
  });
}

export type ClassObservationRow = {
  classId: string;
  className: string;
  level: string;
  total: number;
  positive: number;
  neutral: number;
  concern: number;
  studentsCovered: number;
  enrolled: number;
};

/** Observation summary for a week, one row per class. */
export async function getObservationSummaryForWeek(
  anyDayInWeek: Date,
  classIds?: string[] | "ALL",
): Promise<{ rows: ClassObservationRow[]; from: Date; to: Date }> {
  const from = startOfWeek(anyDayInWeek);
  const to = endOfWeek(anyDayInWeek);
  const year = await getCurrentYear();
  if (!year) return { rows: [], from, to };

  const classes = await prisma.class.findMany({
    where: {
      academicYearId: year.id,
      ...(classIds && classIds !== "ALL" ? { id: { in: classIds } } : {}),
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      level: true,
      _count: { select: { students: true } },
    },
  });
  if (classes.length === 0) return { rows: [], from, to };

  const ids = classes.map((c) => c.id);
  const [grouped, distinctStudents] = await Promise.all([
    prisma.observation.groupBy({
      by: ["classId", "sentiment"],
      where: { date: { gte: from, lte: to }, classId: { in: ids } },
      _count: { _all: true },
    }),
    prisma.observation.findMany({
      where: { date: { gte: from, lte: to }, classId: { in: ids } },
      select: { classId: true, studentId: true },
      distinct: ["classId", "studentId"],
    }),
  ]);

  const bySentiment = new Map<string, Record<string, number>>();
  for (const row of grouped) {
    const entry = bySentiment.get(row.classId) ?? {};
    entry[row.sentiment] = row._count._all;
    bySentiment.set(row.classId, entry);
  }
  const covered = new Map<string, number>();
  for (const row of distinctStudents) {
    covered.set(row.classId, (covered.get(row.classId) ?? 0) + 1);
  }

  const rows = classes.map((klass) => {
    const counts = bySentiment.get(klass.id) ?? {};
    const positive = counts.POSITIVE ?? 0;
    const neutral = counts.NEUTRAL ?? 0;
    const concern = counts.CONCERN ?? 0;
    return {
      classId: klass.id,
      className: klass.name,
      level: klass.level,
      total: positive + neutral + concern,
      positive,
      neutral,
      concern,
      studentsCovered: covered.get(klass.id) ?? 0,
      enrolled: klass._count.students,
    };
  });

  return { rows, from, to };
}

/** Students of a class, ordered for the register. */
export async function getClassRoster(classId: string) {
  return prisma.student.findMany({
    where: { classId, isActive: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
}

/**
 * A student the given user is allowed to open, or null.
 *
 * Staff roles see every student; supervisors and teachers only the students of
 * the classes assigned to them; a parent only their own children; a student
 * only their own record. Used by the student profile page, which is reachable
 * by parents and students who hold no `students` module grant.
 */
export async function getStudentIfVisible(
  user: Pick<CurrentUser, "userId" | "role" | "access">,
  studentId: string,
) {
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    include: {
      class: { include: { academicYear: true } },
      parent: true,
      user: true,
    },
  });
  if (!student) return null;

  const role = user.role as Role;
  if (role === "PARENT") return student.parentId === user.userId ? student : null;
  if (role === "STUDENT") return student.userId === user.userId ? student : null;

  // Every other role reaches a student through the students module.
  if (!user.access.students?.view) return null;

  const visible = await getVisibleClassIds(user);
  if (visible === "ALL") return student;
  return student.classId && visible.includes(student.classId) ? student : null;
}

export type StudentHistory = Awaited<ReturnType<typeof getStudentHistory>>;

/** Everything the profile page shows for one student, since `from`. */
export async function getStudentHistory(studentId: string, from: Date) {
  const [attendance, observations, counts] = await Promise.all([
    prisma.attendance.findMany({
      where: { studentId, date: { gte: from } },
      orderBy: { date: "desc" },
      include: { recordedBy: { select: { firstName: true, lastName: true } } },
    }),
    prisma.observation.findMany({
      where: { studentId, date: { gte: from } },
      orderBy: { date: "desc" },
      include: { author: { select: { firstName: true, lastName: true } } },
    }),
    prisma.attendance.groupBy({
      by: ["status"],
      where: { studentId, date: { gte: from } },
      _count: { _all: true },
    }),
  ]);

  const byStatus = Object.fromEntries(
    counts.map((row) => [row.status, row._count._all]),
  ) as Partial<Record<AttendanceStatus, number>>;

  const present = byStatus.PRESENT ?? 0;
  const absent = byStatus.ABSENT ?? 0;
  const late = byStatus.LATE ?? 0;
  const excused = byStatus.EXCUSED ?? 0;
  const recorded = present + absent + late + excused;

  return {
    attendance,
    observations,
    present,
    absent,
    late,
    excused,
    recorded,
    rate: recorded > 0 ? ((present + late) / recorded) * 100 : null,
    concerns: observations.filter((o) => o.sentiment === "CONCERN").length,
    positives: observations.filter((o) => o.sentiment === "POSITIVE").length,
  };
}

// ---------------------------------------------------------------------------
// Reports — aggregates over a date range rather than a single day or week
// ---------------------------------------------------------------------------

export type ReportRange = { from: Date; to: Date };

export type ClassReportRow = ClassAttendanceRow & {
  daysRecorded: number;
  observations: number;
  concerns: number;
};

/** One row per class, aggregated over the whole range. */
export async function getClassReport(
  range: ReportRange,
  classIds: string[],
): Promise<ClassReportRow[]> {
  if (classIds.length === 0) return [];

  const where = { date: { gte: range.from, lte: range.to } };
  const [classes, grouped, days, obs, concerns] = await Promise.all([
    prisma.class.findMany({
      where: { id: { in: classIds } },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        level: true,
        _count: { select: { students: true } },
      },
    }),
    prisma.attendance.groupBy({
      by: ["classId", "status"],
      where: { ...where, classId: { in: classIds } },
      _count: { _all: true },
    }),
    prisma.attendance.findMany({
      where: { ...where, classId: { in: classIds } },
      select: { classId: true, date: true },
      distinct: ["classId", "date"],
    }),
    prisma.observation.groupBy({
      by: ["classId"],
      where: { ...where, classId: { in: classIds } },
      _count: { _all: true },
    }),
    prisma.observation.groupBy({
      by: ["classId"],
      where: { ...where, classId: { in: classIds }, sentiment: "CONCERN" },
      _count: { _all: true },
    }),
  ]);

  const counts = new Map<string, Record<string, number>>();
  for (const row of grouped) {
    const entry = counts.get(row.classId) ?? {};
    entry[row.status] = row._count._all;
    counts.set(row.classId, entry);
  }
  const dayCount = new Map<string, number>();
  for (const row of days) {
    dayCount.set(row.classId, (dayCount.get(row.classId) ?? 0) + 1);
  }
  const obsCount = new Map(obs.map((r) => [r.classId, r._count._all]));
  const concernCount = new Map(concerns.map((r) => [r.classId, r._count._all]));

  return classes.map((klass) => {
    const c = counts.get(klass.id) ?? {};
    const present = c.PRESENT ?? 0;
    const absent = c.ABSENT ?? 0;
    const late = c.LATE ?? 0;
    const excused = c.EXCUSED ?? 0;
    const recorded = present + absent + late + excused;
    return {
      classId: klass.id,
      className: klass.name,
      level: klass.level,
      enrolled: klass._count.students,
      present,
      absent,
      late,
      excused,
      recorded,
      taken: recorded > 0,
      rate: recorded > 0 ? ((present + late) / recorded) * 100 : null,
      daysRecorded: dayCount.get(klass.id) ?? 0,
      observations: obsCount.get(klass.id) ?? 0,
      concerns: concernCount.get(klass.id) ?? 0,
    };
  });
}

export type StudentReportRow = {
  studentId: string;
  code: string;
  name: string;
  className: string;
  present: number;
  absent: number;
  late: number;
  excused: number;
  recorded: number;
  rate: number | null;
  concerns: number;
};

/** One row per student, worst attendance first. */
export async function getStudentReport(
  range: ReportRange,
  classIds: string[],
): Promise<StudentReportRow[]> {
  if (classIds.length === 0) return [];

  const where = { date: { gte: range.from, lte: range.to } };
  const [students, grouped, concerns] = await Promise.all([
    prisma.student.findMany({
      where: { classId: { in: classIds }, isActive: true },
      include: { class: { select: { name: true } } },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    prisma.attendance.groupBy({
      by: ["studentId", "status"],
      where: { ...where, classId: { in: classIds } },
      _count: { _all: true },
    }),
    prisma.observation.groupBy({
      by: ["studentId"],
      where: { ...where, classId: { in: classIds }, sentiment: "CONCERN" },
      _count: { _all: true },
    }),
  ]);

  const counts = new Map<string, Record<string, number>>();
  for (const row of grouped) {
    const entry = counts.get(row.studentId) ?? {};
    entry[row.status] = row._count._all;
    counts.set(row.studentId, entry);
  }
  const concernCount = new Map(concerns.map((r) => [r.studentId, r._count._all]));

  return students
    .map((student) => {
      const c = counts.get(student.id) ?? {};
      const present = c.PRESENT ?? 0;
      const absent = c.ABSENT ?? 0;
      const late = c.LATE ?? 0;
      const excused = c.EXCUSED ?? 0;
      const recorded = present + absent + late + excused;
      return {
        studentId: student.id,
        code: student.code,
        name: `${student.lastName}, ${student.firstName}`,
        className: student.class?.name ?? "Unassigned",
        present,
        absent,
        late,
        excused,
        recorded,
        rate: recorded > 0 ? ((present + late) / recorded) * 100 : null,
        concerns: concernCount.get(student.id) ?? 0,
      };
    })
    .sort(
      (a, b) =>
        b.absent - a.absent ||
        b.late - a.late ||
        a.name.localeCompare(b.name),
    );
}

/** Observation counts as a category × sentiment matrix. */
export async function getObservationMatrix(
  range: ReportRange,
  classIds: string[],
) {
  if (classIds.length === 0) return [];
  return prisma.observation.groupBy({
    by: ["category", "sentiment"],
    where: {
      date: { gte: range.from, lte: range.to },
      classId: { in: classIds },
    },
    _count: { _all: true },
  });
}

/** Attendance rate per school day, oldest first — the trend line. */
export async function getDailyTrend(range: ReportRange, classIds: string[]) {
  if (classIds.length === 0) return [];
  const grouped = await prisma.attendance.groupBy({
    by: ["date", "status"],
    where: {
      date: { gte: range.from, lte: range.to },
      classId: { in: classIds },
    },
    _count: { _all: true },
  });

  const byDay = new Map<number, Record<string, number>>();
  for (const row of grouped) {
    const key = row.date.getTime();
    const entry = byDay.get(key) ?? {};
    entry[row.status] = row._count._all;
    byDay.set(key, entry);
  }

  return [...byDay.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([time, c]) => {
      const present = c.PRESENT ?? 0;
      const absent = c.ABSENT ?? 0;
      const late = c.LATE ?? 0;
      const excused = c.EXCUSED ?? 0;
      const recorded = present + absent + late + excused;
      return {
        date: new Date(time),
        present,
        absent,
        late,
        excused,
        recorded,
        rate: recorded > 0 ? ((present + late) / recorded) * 100 : null,
      };
    });
}
