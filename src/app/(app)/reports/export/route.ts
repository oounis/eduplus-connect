import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { resolveReportScope, toCsv } from "@/lib/reports";
import { prisma } from "@/lib/db";
import { getClassReport, getStudentReport } from "@/lib/queries";
import { toISODate } from "@/lib/dates";

const TYPES = ["classes", "students", "observations", "attendance"] as const;
type ExportType = (typeof TYPES)[number];

/**
 * CSV of whatever the reports page is showing. The scope is resolved with the
 * same helper the page uses, so an export can never reach a class the user is
 * not allowed to see.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Not signed in", { status: 401 });
  if (!user.access.reports?.view) {
    return new NextResponse("Not allowed", { status: 403 });
  }

  const params = request.nextUrl.searchParams;
  const type = (params.get("type") ?? "classes") as ExportType;
  if (!TYPES.includes(type)) {
    return new NextResponse("Unknown report type", { status: 400 });
  }

  const scope = await resolveReportScope(user, {
    from: params.get("from") ?? undefined,
    to: params.get("to") ?? undefined,
    classId: params.get("classId") ?? undefined,
  });

  let csv: string;

  if (type === "classes") {
    const rows = await getClassReport(scope, scope.classIds);
    csv = toCsv(
      ["Class", "Level", "Students", "Days taken", "Present", "Absent", "Late",
       "Excused", "Records", "Attendance rate %", "Observations", "Concerns"],
      rows.map((r) => [
        r.className, r.level, r.enrolled, r.daysRecorded, r.present, r.absent,
        r.late, r.excused, r.recorded,
        r.rate === null ? "" : r.rate.toFixed(1), r.observations, r.concerns,
      ]),
    );
  } else if (type === "students") {
    const rows = await getStudentReport(scope, scope.classIds);
    csv = toCsv(
      ["Code", "Student", "Class", "Present", "Absent", "Late", "Excused",
       "Records", "Attendance rate %", "Concerns"],
      rows.map((r) => [
        r.code, r.name, r.className, r.present, r.absent, r.late, r.excused,
        r.recorded, r.rate === null ? "" : r.rate.toFixed(1), r.concerns,
      ]),
    );
  } else if (type === "observations") {
    const rows = await prisma.observation.findMany({
      where: {
        date: { gte: scope.from, lte: scope.to },
        classId: { in: scope.classIds },
      },
      orderBy: { date: "desc" },
      include: {
        student: { select: { code: true, firstName: true, lastName: true } },
        class: { select: { name: true } },
        author: { select: { firstName: true, lastName: true } },
      },
    });
    csv = toCsv(
      ["Date", "Class", "Student code", "Student", "Category", "Sentiment", "Note", "Author"],
      rows.map((r) => [
        toISODate(r.date), r.class.name, r.student.code,
        `${r.student.lastName}, ${r.student.firstName}`,
        r.category, r.sentiment, r.note,
        `${r.author.firstName} ${r.author.lastName}`,
      ]),
    );
  } else {
    const rows = await prisma.attendance.findMany({
      where: {
        date: { gte: scope.from, lte: scope.to },
        classId: { in: scope.classIds },
      },
      orderBy: [{ date: "desc" }, { classId: "asc" }],
      include: {
        student: { select: { code: true, firstName: true, lastName: true } },
        class: { select: { name: true } },
        recordedBy: { select: { firstName: true, lastName: true } },
      },
    });
    csv = toCsv(
      ["Date", "Class", "Student code", "Student", "Status", "Note", "Recorded by"],
      rows.map((r) => [
        toISODate(r.date), r.class.name, r.student.code,
        `${r.student.lastName}, ${r.student.firstName}`,
        r.status, r.note ?? "",
        `${r.recordedBy.firstName} ${r.recordedBy.lastName}`,
      ]),
    );
  }

  const name = `eduplus-${type}-${scope.fromISO}-to-${scope.toISO}.csv`;
  return new NextResponse(`﻿${csv}`, {
    headers: {
      // The BOM makes Excel open the file as UTF-8 without an import wizard.
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
