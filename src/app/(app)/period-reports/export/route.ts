import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  getPeriodRecords,
  getPeriodReport,
  resolvePeriodReportScope,
} from "@/lib/periods";
import { buildWorkbook, fileName, XLSX_CONTENT_TYPE } from "@/lib/xlsx";
import { toISODate } from "@/lib/dates";

/**
 * The period report as a real Excel workbook — four sheets, matching the four
 * questions the page answers, plus every record behind them so the totals can
 * be checked.
 *
 * Scope is resolved with the same helper the page uses, so an export can never
 * reach a class the user is not allowed to see.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Not signed in", { status: 401 });
  if (!user.access.periodReports?.view) {
    return new NextResponse("Not allowed", { status: 403 });
  }

  const params = request.nextUrl.searchParams;
  const scope = await resolvePeriodReportScope(user, {
    from: params.get("from") ?? undefined,
    to: params.get("to") ?? undefined,
    classId: params.getAll("classId"),
    periodId: params.getAll("periodId"),
  });

  const [report, records] = await Promise.all([
    getPeriodReport(scope),
    getPeriodRecords(scope),
  ]);

  const pct = (value: number | null) =>
    value === null ? "" : Number(value.toFixed(1));

  const caption = `${scope.fromISO} to ${scope.toISO} · ${records.length} record(s) · exported ${toISODate(new Date())}`;

  const attendanceColumns = [
    { header: "Present", key: "present", width: 10 },
    { header: "Absent", key: "absent", width: 10 },
    { header: "Late", key: "late", width: 10 },
    { header: "Excused", key: "excused", width: 10 },
    { header: "Records", key: "recorded", width: 10 },
    { header: "Attendance rate %", key: "rate", width: 18 },
  ];

  const buffer = await buildWorkbook(
    [
      {
        name: "By period",
        caption,
        columns: [
          { header: "Period", key: "periodName", width: 16 },
          { header: "Starts", key: "startTime", width: 10 },
          { header: "Ends", key: "endTime", width: 10 },
          ...attendanceColumns,
        ],
        rows: report.byPeriod.map((r) => ({
          periodName: r.periodName,
          startTime: r.startTime,
          endTime: r.endTime,
          present: r.present,
          absent: r.absent,
          late: r.late,
          excused: r.excused,
          recorded: r.recorded,
          rate: pct(r.rate),
        })),
      },
      {
        name: "By period and class",
        caption,
        columns: [
          { header: "Period", key: "periodName", width: 16 },
          { header: "Class", key: "className", width: 18 },
          ...attendanceColumns,
        ],
        rows: report.byPeriodClass.map((r) => ({
          periodName: r.periodName,
          className: r.className ?? "",
          present: r.present,
          absent: r.absent,
          late: r.late,
          excused: r.excused,
          recorded: r.recorded,
          rate: pct(r.rate),
        })),
      },
      {
        name: "By day and period",
        caption,
        columns: [
          { header: "Date", key: "dateISO", width: 12 },
          { header: "Period", key: "periodName", width: 16 },
          ...attendanceColumns,
        ],
        rows: report.byDayPeriod.map((r) => ({
          dateISO: r.dateISO ?? "",
          periodName: r.periodName,
          present: r.present,
          absent: r.absent,
          late: r.late,
          excused: r.excused,
          recorded: r.recorded,
          rate: pct(r.rate),
        })),
      },
      {
        name: "Records",
        caption,
        columns: [
          { header: "Date", key: "date", width: 12 },
          { header: "Period", key: "period", width: 16 },
          { header: "Starts", key: "startTime", width: 10 },
          { header: "Class", key: "className", width: 18 },
          { header: "Level", key: "level", width: 12 },
          { header: "Student code", key: "code", width: 13 },
          { header: "Student", key: "student", width: 24 },
          { header: "Status", key: "status", width: 12 },
          { header: "Note", key: "note", width: 40 },
          { header: "Recorded by", key: "recordedBy", width: 22 },
        ],
        rows: records.map((r) => ({
          date: toISODate(r.date),
          period: r.period.name,
          startTime: r.period.startTime,
          className: r.class.name,
          level: r.class.level,
          code: r.student.code,
          student: `${r.student.lastName}, ${r.student.firstName}`,
          status: r.status,
          note: r.note ?? "",
          recordedBy: `${r.recordedBy.firstName} ${r.recordedBy.lastName}`,
        })),
      },
    ],
    { title: "EduPlus Connect — attendance by period", rtl: true },
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": XLSX_CONTENT_TYPE,
      "Content-Disposition": `attachment; filename="${fileName(["eduplus", "attendance-by-period", scope.fromISO, "to", scope.toISO])}"`,
      "Cache-Control": "no-store",
    },
  });
}
