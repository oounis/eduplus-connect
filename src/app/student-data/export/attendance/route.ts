import { NextResponse, type NextRequest } from "next/server";
import { getI18n } from "@/lib/locale";
import {
  attendanceByDay,
  buildMonthlySheets,
  clampMonth,
  defaultMonthRange,
  formatMonth,
  monthBounds,
  monthsBetween,
  parseMonth,
  statusCodes,
} from "@/lib/student-data";
import { buildWorkbook, fileName, XLSX_CONTENT_TYPE } from "@/lib/xlsx";
import { auditExport, resolveExportScope } from "../scope";

/**
 * The monthly attendance table: one sheet per month, the students of every
 * class down the side, a column for each day of that month, and each student's
 * absence total for the month at the end.
 *
 * The months come from the request but are clamped into the academic year, so
 * a typed URL cannot ask for a workbook of empty sheets.
 */
export async function POST(request: NextRequest) {
  const { locale, t } = await getI18n();
  const resolved = await resolveExportScope(request, {
    thisClass: (name) => name,
    allClasses: t("sd.scopeAll"),
  });
  if (!resolved.ok) return resolved.response;

  const { formData, students, classIds, label, supervisor } = resolved;

  const range = await defaultMonthRange();
  const from = clampMonth(
    parseMonth(String(formData.get("from") ?? "")) ?? range.from,
    range.earliest,
    range.latest,
  );
  const to = clampMonth(
    parseMonth(String(formData.get("to") ?? "")) ?? range.to,
    range.earliest,
    range.latest,
  );
  // A range typed backwards produces no sheets at all, and a workbook with no
  // sheets will not open. Swap instead of failing.
  const [first, last] =
    from.year * 12 + from.month <= to.year * 12 + to.month ? [from, to] : [to, from];
  const months = monthsBetween(first, last);

  // One query for the whole span rather than one per month: twelve months of a
  // ten-class school is a few thousand rows, and twelve round trips for that is
  // twelve times the latency for the same data.
  const byDay = await attendanceByDay(
    classIds,
    monthBounds(first).from,
    monthBounds(last).to,
  );

  const codes = statusCodes(t);
  const legend = t("sd.legend", {
    p: codes.PRESENT,
    a: codes.ABSENT,
    l: codes.LATE,
    e: codes.EXCUSED,
  });

  const sheets = buildMonthlySheets({
    students,
    months,
    byDay,
    t,
    caption: (month) =>
      t("sd.caption.month", {
        month: formatMonth(month),
        scope: label,
        n: students.length,
        legend,
      }),
  });

  const buffer = await buildWorkbook(sheets, {
    title: t("sd.exportAttendance"),
    rtl: locale === "ar",
  });

  await auditExport(
    supervisor,
    `Exported the monthly attendance table for ${label}, ${formatMonth(first)} to ${formatMonth(last)} — ${students.length} student(s) — via student data`,
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": XLSX_CONTENT_TYPE,
      "Content-Disposition": `attachment; filename="${fileName(["eduplus", "attendance", formatMonth(first), "to", formatMonth(last)])}"`,
      "Cache-Control": "no-store",
    },
  });
}

/** Kept only so a mistyped GET says why, rather than 405 with no explanation. */
export async function GET() {
  return new NextResponse(
    "This export is produced by the form on /student-data/classes",
    { status: 405, headers: { "Cache-Control": "no-store" } },
  );
}
