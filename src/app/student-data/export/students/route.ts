import { NextResponse, type NextRequest } from "next/server";
import { getI18n } from "@/lib/locale";
import { toISODate } from "@/lib/dates";
import { latestNotes } from "@/lib/student-data";
import { buildWorkbook, fileName, XLSX_CONTENT_TYPE } from "@/lib/xlsx";
import { auditExport, resolveExportScope } from "../scope";

/**
 * The student list as one Excel sheet, in the columns the school asked for:
 * a running number, the registration number, the student, the given name, the
 * class, the three phone numbers, the email address and the notes.
 *
 * "Notes" is the last observation written about the student — the module this
 * app calls الملاحظات — rather than a blank column, so the sheet is worth
 * printing as it stands.
 *
 * POST rather than GET because the ticked students travel with it, and three
 * hundred ids do not belong in a URL.
 */
export async function POST(request: NextRequest) {
  const { locale, t } = await getI18n();
  const resolved = await resolveExportScope(request, {
    thisClass: (name) => name,
    allClasses: t("sd.scopeAll"),
  });
  if (!resolved.ok) return resolved.response;

  const { students, label, supervisor } = resolved;
  const notes = await latestNotes(students.map((s) => s.id));
  const exportedOn = toISODate(new Date());

  const buffer = await buildWorkbook(
    [
      {
        name: t("sd.sheet.students"),
        caption: t("sd.caption.students", {
          scope: label,
          n: students.length,
          date: exportedOn,
        }),
        columns: [
          { header: t("sd.col.index"), key: "index", width: 9 },
          { header: t("sd.col.code"), key: "code", width: 12 },
          { header: t("sd.col.surname"), key: "surname", width: 18 },
          { header: t("sd.col.firstName"), key: "firstName", width: 18 },
          { header: t("sd.col.class"), key: "className", width: 14 },
          { header: t("sd.col.phone"), key: "phone", width: 18 },
          { header: t("sd.col.phone2"), key: "phone2", width: 18 },
          { header: t("sd.col.phone3"), key: "phone3", width: 18 },
          { header: t("sd.col.email"), key: "email", width: 28 },
          { header: t("sd.col.notes"), key: "notes", width: 44 },
        ],
        rows: students.map((student, index) => ({
          index: index + 1,
          code: student.code,
          surname: student.lastName,
          firstName: student.firstName,
          className: student.className,
          phone: student.phone ?? "",
          phone2: student.phone2 ?? "",
          phone3: student.phone3 ?? "",
          email: student.email ?? "",
          notes: notes.get(student.id) ?? "",
        })),
      },
    ],
    { title: t("sd.sheet.students"), rtl: locale === "ar" },
  );

  await auditExport(
    supervisor,
    `Exported the student list for ${label} — ${students.length} student(s) — via student data`,
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": XLSX_CONTENT_TYPE,
      "Content-Disposition": `attachment; filename="${fileName(["eduplus", "students", exportedOn])}"`,
      "Cache-Control": "no-store",
    },
  });
}
