import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { resolveReportScope } from "@/lib/reports";
import { buildWorkbook, fileName, XLSX_CONTENT_TYPE } from "@/lib/xlsx";
import { startOfWeek, toISODate } from "@/lib/dates";

/**
 * Observations grouped by week, as a real Excel workbook.
 *
 * Three sheets, because "per week" is the question and one flat list does not
 * answer it:
 *   1. By week      — one row per week: totals, sentiment split, how many
 *                     students and classes were covered.
 *   2. By week & class — the same but broken down per class, which is what
 *                     tells you who is actually writing observations.
 *   3. Observations  — every record, with its week, so the numbers above can
 *                     be checked.
 *
 * Scope comes from `resolveReportScope`, the same helper the reports page and
 * the CSV export use, so this can never reach a class the user may not see.
 */

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Not signed in", { status: 401 });
  if (!user.access.reports?.view) {
    return new NextResponse("Not allowed", { status: 403 });
  }

  const params = request.nextUrl.searchParams;
  const scope = await resolveReportScope(user, {
    from: params.get("from") ?? undefined,
    to: params.get("to") ?? undefined,
    classId: params.get("classId") ?? undefined,
  });

  const observations = await prisma.observation.findMany({
    where: {
      date: { gte: scope.from, lte: scope.to },
      classId: { in: scope.classIds },
    },
    orderBy: [{ date: "asc" }, { classId: "asc" }],
    include: {
      student: { select: { code: true, firstName: true, lastName: true } },
      class: { select: { name: true, level: true } },
      author: { select: { firstName: true, lastName: true } },
    },
  });

  type Bucket = {
    weekISO: string;
    className: string;
    total: number;
    positive: number;
    neutral: number;
    concern: number;
    students: Set<string>;
    classes: Set<string>;
    categories: Record<string, number>;
  };
  const emptyBucket = (weekISO: string, className: string): Bucket => ({
    weekISO,
    className,
    total: 0,
    positive: 0,
    neutral: 0,
    concern: 0,
    students: new Set(),
    classes: new Set(),
    categories: {},
  });

  const byWeek = new Map<string, Bucket>();
  const byWeekClass = new Map<string, Bucket>();

  for (const o of observations) {
    const weekISO = toISODate(startOfWeek(o.date));
    const weekKey = weekISO;
    const classKey = `${weekISO}::${o.class.name}`;

    for (const [map, key, label] of [
      [byWeek, weekKey, ""],
      [byWeekClass, classKey, o.class.name],
    ] as const) {
      let bucket = map.get(key);
      if (!bucket) {
        bucket = emptyBucket(weekISO, label);
        map.set(key, bucket);
      }
      bucket.total += 1;
      if (o.sentiment === "POSITIVE") bucket.positive += 1;
      else if (o.sentiment === "NEUTRAL") bucket.neutral += 1;
      else if (o.sentiment === "CONCERN") bucket.concern += 1;
      bucket.students.add(o.studentId);
      bucket.classes.add(o.classId);
      bucket.categories[o.category] = (bucket.categories[o.category] ?? 0) + 1;
    }
  }

  const topCategory = (bucket: Bucket) => {
    const entries = Object.entries(bucket.categories).sort((a, b) => b[1] - a[1]);
    return entries.length ? `${entries[0][0]} (${entries[0][1]})` : "";
  };

  const weekRows = [...byWeek.values()]
    .sort((a, b) => a.weekISO.localeCompare(b.weekISO))
    .map((b) => ({
      week: b.weekISO,
      total: b.total,
      positive: b.positive,
      neutral: b.neutral,
      concern: b.concern,
      concernPct: b.total ? Number(((100 * b.concern) / b.total).toFixed(1)) : 0,
      students: b.students.size,
      classes: b.classes.size,
      topCategory: topCategory(b),
    }));

  const weekClassRows = [...byWeekClass.values()]
    .sort(
      (a, b) =>
        a.weekISO.localeCompare(b.weekISO) || a.className.localeCompare(b.className),
    )
    .map((b) => ({
      week: b.weekISO,
      className: b.className,
      total: b.total,
      positive: b.positive,
      neutral: b.neutral,
      concern: b.concern,
      students: b.students.size,
      topCategory: topCategory(b),
    }));

  const caption = `${scope.fromISO} to ${scope.toISO} · ${observations.length} observation(s) across ${weekRows.length} week(s) · exported ${toISODate(new Date())}`;

  const buffer = await buildWorkbook(
    [
      {
        name: "By week",
        caption,
        columns: [
          { header: "Week starting", key: "week", width: 14 },
          { header: "Observations", key: "total", width: 13 },
          { header: "Positive", key: "positive", width: 10 },
          { header: "Neutral", key: "neutral", width: 10 },
          { header: "Concern", key: "concern", width: 10 },
          { header: "Concern %", key: "concernPct", width: 11 },
          { header: "Students covered", key: "students", width: 17 },
          { header: "Classes covered", key: "classes", width: 16 },
          { header: "Most common category", key: "topCategory", width: 24 },
        ],
        rows: weekRows,
      },
      {
        name: "By week and class",
        caption,
        columns: [
          { header: "Week starting", key: "week", width: 14 },
          { header: "Class", key: "className", width: 18 },
          { header: "Observations", key: "total", width: 13 },
          { header: "Positive", key: "positive", width: 10 },
          { header: "Neutral", key: "neutral", width: 10 },
          { header: "Concern", key: "concern", width: 10 },
          { header: "Students covered", key: "students", width: 17 },
          { header: "Most common category", key: "topCategory", width: 24 },
        ],
        rows: weekClassRows,
      },
      {
        name: "Observations",
        caption,
        columns: [
          { header: "Week starting", key: "week", width: 14 },
          { header: "Date", key: "date", width: 12 },
          { header: "Class", key: "className", width: 18 },
          { header: "Level", key: "level", width: 12 },
          { header: "Student code", key: "code", width: 13 },
          { header: "Student", key: "student", width: 24 },
          { header: "Category", key: "category", width: 15 },
          { header: "Sentiment", key: "sentiment", width: 12 },
          { header: "Note", key: "note", width: 60 },
          { header: "Written by", key: "author", width: 22 },
        ],
        rows: observations.map((o) => ({
          week: toISODate(startOfWeek(o.date)),
          date: toISODate(o.date),
          className: o.class.name,
          level: o.class.level,
          code: o.student.code,
          student: `${o.student.lastName}, ${o.student.firstName}`,
          category: o.category,
          sentiment: o.sentiment,
          note: o.note,
          author: `${o.author.firstName} ${o.author.lastName}`,
        })),
      },
    ],
    { title: "EduPlus Connect — observations by week" },
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": XLSX_CONTENT_TYPE,
      "Content-Disposition": `attachment; filename="${fileName(["eduplus", "observations-by-week", scope.fromISO, "to", scope.toISO])}"`,
      "Cache-Control": "no-store",
    },
  });
}
