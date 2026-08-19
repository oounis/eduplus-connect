import { prisma } from "./db";
import { endOfWeek, startOfWeek } from "./dates";
import type { CurrentUser } from "./auth";
import type { Role } from "./constants";

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
