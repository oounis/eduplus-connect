import { NextResponse, type NextRequest } from "next/server";
import { getI18n } from "@/lib/locale";
import { toISODate } from "@/lib/dates";
import {
  buildMessageRows,
  PHONE_FIELDS,
  type PhoneField,
} from "@/lib/student-data";
import {
  buildWorkbook,
  fileName,
  XLSX_CONTENT_TYPE,
  type Sheet,
} from "@/lib/xlsx";
import { auditExport, resolveExportScope } from "../scope";

/**
 * The message file: two columns, a phone number and the text to send to it,
 * which is the shape a bulk-SMS tool reads.
 *
 * Two kinds of message, as asked for. A named one addresses the guardian by the
 * child's name — "Guardian of the student X, we are informing you…" — and a
 * general one sends the same sentence to everybody. The second and third phone
 * numbers are not extra columns: they become extra rows under the same phone
 * heading, each carrying that student's own message.
 *
 * A second sheet lists the students left out because no number is recorded for
 * them. Without it, a file of 300 rows for 320 students silently means twenty
 * families were not contacted.
 */
export async function POST(request: NextRequest) {
  const { locale, t } = await getI18n();
  const formData = await request.formData();

  const resolved = await resolveExportScope(request, formData, {
    thisClass: (name) => name,
    allClasses: t("sd.scopeAll"),
  });
  if (!resolved.ok) return resolved.response;

  const { students, label, supervisor } = resolved;

  // Longer than any SMS anyone sends, and short enough that a pasted document
  // cannot become a 320-row workbook of itself.
  const MAX_MESSAGE = 1000;
  const text = String(formData.get("text") ?? "").trim();
  if (!text) return new NextResponse(t("sd.msgEmpty"), { status: 400 });
  if (text.length > MAX_MESSAGE) {
    return new NextResponse(t("sd.msgTooLong", { n: MAX_MESSAGE }), {
      status: 400,
    });
  }

  // Only the three known columns, in their natural order however they were
  // posted, so a crafted field name cannot reach another column of the table.
  const requested = new Set(formData.getAll("field").map((v) => String(v)));
  const fields = PHONE_FIELDS.filter((field) =>
    requested.has(field),
  ) as PhoneField[];
  if (fields.length === 0) {
    return new NextResponse(t("sd.msgNoNumbers"), { status: 400 });
  }

  if (students.length === 0) {
    return new NextResponse(t("sd.msgNoStudents"), { status: 400 });
  }

  const { rows, skipped } = buildMessageRows(students, {
    fields,
    named: String(formData.get("mode") ?? "named") === "named",
    text,
    namedTemplate: t("sd.msgNamedTemplate"),
  });

  const exportedOn = toISODate(new Date());
  const caption = t("sd.caption.messages", {
    rows: rows.length,
    n: students.length,
    date: exportedOn,
  });

  const sheets: Sheet[] = [
    {
      name: t("sd.sheet.messages"),
      caption,
      // Exactly the two columns that were asked for, in that order.
      columns: [
        { header: t("sd.col.phone"), key: "phone", width: 20 },
        { header: t("sd.col.message"), key: "message", width: 70 },
      ],
      rows: rows.map((row) => ({ phone: row.phone, message: row.message })),
    },
  ];

  if (skipped.length > 0) {
    sheets.push({
      name: t("sd.sheet.noPhone"),
      caption: t("sd.caption.noPhone"),
      columns: [
        { header: t("sd.col.code"), key: "code", width: 14 },
        { header: t("sd.col.student"), key: "student", width: 30 },
        { header: t("sd.col.class"), key: "className", width: 16 },
      ],
      rows: skipped.map((student) => ({
        code: student.code,
        student: `${student.lastName} ${student.firstName}`,
        className: student.className,
      })),
    });
  }

  const buffer = await buildWorkbook(sheets, {
    title: t("sd.messages"),
    rtl: locale === "ar",
  });

  await auditExport(
    supervisor,
    `Created a message file for ${label} — ${rows.length} row(s) for ${students.length} student(s)` +
      (skipped.length ? `, ${skipped.length} with no number` : "") +
      " — via student data",
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": XLSX_CONTENT_TYPE,
      "Content-Disposition": `attachment; filename="${fileName(["eduplus", "messages", exportedOn])}"`,
      "Cache-Control": "no-store",
    },
  });
}

/** Kept only so a mistyped GET says why, rather than 405 with no explanation. */
export async function GET() {
  return new NextResponse(
    "This file is produced by the form on /student-data/classes",
    { status: 405, headers: { "Cache-Control": "no-store" } },
  );
}
