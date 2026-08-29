import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { getClassDayGrid } from "@/lib/periods";
import { getCurrentYear } from "@/lib/queries";
import { buildWorkbook, fileName, XLSX_CONTENT_TYPE } from "@/lib/xlsx";
import { toDayKey, toISODate } from "@/lib/dates";
import { schoolClock } from "@/lib/school-time";
import { QUICK_COOKIE, verifyQuickSession } from "@/lib/quick-session";

/**
 * The class's whole day as an Excel workbook: every period, the final status,
 * who took each register and how many were away.
 *
 * Reachable from the classroom device, so it is guarded the same way that page
 * is: a valid quick session, and a class that teacher is actually assigned to.
 * The class is checked here rather than trusted from the query string —
 * otherwise this route would export any class in the school to anyone holding
 * any teacher's PIN.
 */
export async function GET(request: NextRequest) {
  const jar = await cookies();
  const session = await verifyQuickSession(jar.get(QUICK_COOKIE)?.value);
  if (!session) return new NextResponse("Not signed in", { status: 401 });

  const teacher = await prisma.user.findFirst({
    where: { id: session.userId, role: "TEACHER", isActive: true },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!teacher) return new NextResponse("Not signed in", { status: 401 });

  const classId = request.nextUrl.searchParams.get("classId") ?? "";
  const year = await getCurrentYear();
  const assigned = await prisma.classTeacher.findFirst({
    where: {
      userId: teacher.id,
      classId,
      ...(year ? { class: { academicYearId: year.id } } : {}),
    },
    include: { class: { select: { name: true, level: true } } },
  });
  if (!assigned) return new NextResponse("Not allowed", { status: 403 });

  const dateParam = request.nextUrl.searchParams.get("date");
  const clock = schoolClock();
  const dateISO = dateParam ?? clock.dateISO;
  const date = toDayKey(dateISO);

  const { periods, rows, summary } = await getClassDayGrid(classId, date);

  const caption =
    `${assigned.class.name} · ${dateISO} · exported ${toISODate(new Date())}`;

  // Sheet 1: the grid the teacher sees — a column per period, then the final
  // status, which is the column the day is actually judged on.
  const gridColumns = [
    { header: "Student code", key: "code", width: 13 },
    { header: "Student", key: "student", width: 26 },
    ...periods.map((period) => ({
      header: `${period.name} (${period.startTime})`,
      key: `p_${period.id}`,
      width: 14,
    })),
    { header: "Final attendance status", key: "final", width: 22 },
  ];

  const gridRows = rows.map((row) => {
    const record: Record<string, string> = {
      code: row.code,
      student: row.name,
      final: row.finalStatus ?? "Not taken",
    };
    for (const period of periods) {
      record[`p_${period.id}`] = row.byPeriod[period.id]?.status ?? "";
    }
    return record;
  });

  // Sheet 2: the per-period statistics asked for — who took it, and how many
  // were away.
  const summaryRows = summary.map((period) => ({
    period: period.name,
    time: `${period.startTime}–${period.endTime}`,
    teacher: period.teacher ?? "",
    taken: period.taken ? "Yes" : "No",
    present: period.present,
    absent: period.absent,
    late: period.late,
    excused: period.excused,
    recorded: period.recorded,
  }));

  // A day total, so the sheet answers "how bad was today" without arithmetic.
  const finalTally = {
    present: rows.filter((r) => r.finalStatus === "PRESENT").length,
    absent: rows.filter((r) => r.finalStatus === "ABSENT").length,
    late: rows.filter((r) => r.finalStatus === "LATE").length,
    excused: rows.filter((r) => r.finalStatus === "EXCUSED").length,
    notTaken: rows.filter((r) => r.finalStatus === null).length,
  };

  const buffer = await buildWorkbook(
    [
      { name: "Day by period", caption, columns: gridColumns, rows: gridRows },
      {
        name: "Per period",
        caption,
        columns: [
          { header: "Period", key: "period", width: 16 },
          { header: "Time", key: "time", width: 14 },
          { header: "Taken by", key: "teacher", width: 24 },
          { header: "Register taken", key: "taken", width: 15 },
          { header: "Present", key: "present", width: 10 },
          { header: "Absent", key: "absent", width: 10 },
          { header: "Late", key: "late", width: 10 },
          { header: "Excused", key: "excused", width: 10 },
          { header: "Records", key: "recorded", width: 10 },
        ],
        rows: summaryRows,
      },
      {
        name: "Final status",
        caption,
        columns: [
          { header: "Final attendance status", key: "status", width: 24 },
          { header: "Students", key: "count", width: 12 },
        ],
        rows: [
          { status: "Present", count: finalTally.present },
          { status: "Absent", count: finalTally.absent },
          { status: "Late", count: finalTally.late },
          { status: "Excused", count: finalTally.excused },
          { status: "Not taken", count: finalTally.notTaken },
          { status: "Total students", count: rows.length },
        ],
      },
    ],
    { title: `EduPlus — ${assigned.class.name} ${dateISO}`, rtl: true },
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": XLSX_CONTENT_TYPE,
      "Content-Disposition": `attachment; filename="${fileName(["eduplus", assigned.class.name, dateISO])}"`,
      "Cache-Control": "no-store",
    },
  });
}
