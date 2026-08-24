import ExcelJS from "exceljs";

/**
 * Real .xlsx workbooks, not CSV renamed.
 *
 * The CSV export already opens in Excel because of the BOM, but a genuine
 * workbook gives us three things CSV cannot: several sheets in one file,
 * column widths and a frozen header, and no argument with Excel about the list
 * separator on a machine whose locale uses semicolons. It also survives Arabic
 * text without an import wizard, which matters here.
 */

export type Column = {
  header: string;
  /** Key into the row object. */
  key: string;
  width?: number;
};

export type Sheet = {
  name: string;
  columns: Column[];
  rows: Record<string, string | number | null | undefined>[];
  /** Written above the header, for the date range or who exported it. */
  caption?: string;
};

/** Excel rejects : \ / ? * [ ] in sheet names and caps them at 31 chars. */
function safeSheetName(name: string): string {
  const cleaned = name.replace(/[:\\/?*[\]]/g, " ").trim();
  return (cleaned || "Sheet").slice(0, 31);
}

export async function buildWorkbook(
  sheets: Sheet[],
  meta?: { title?: string; rtl?: boolean },
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "EduPlus Connect";
  wb.created = new Date();
  if (meta?.title) wb.title = meta.title;

  for (const sheet of sheets) {
    const ws = wb.addWorksheet(safeSheetName(sheet.name), {
      views: [
        {
          // Freeze the header so a long class list stays readable, and mirror
          // the sheet for Arabic.
          state: "frozen",
          ySplit: sheet.caption ? 2 : 1,
          rightToLeft: meta?.rtl ?? false,
        },
      ],
    });

    if (sheet.caption) {
      const captionRow = ws.addRow([sheet.caption]);
      captionRow.font = { italic: true, size: 10, color: { argb: "FF6B7280" } };
      ws.mergeCells(captionRow.number, 1, captionRow.number, Math.max(sheet.columns.length, 1));
    }

    ws.columns = sheet.columns.map((c) => ({
      header: c.header,
      key: c.key,
      width: c.width ?? Math.max(12, Math.min(48, c.header.length + 4)),
    }));

    // Setting ws.columns after a caption row still writes the header at row 1,
    // so put the header in explicitly and keep the caption above it.
    if (sheet.caption) {
      ws.spliceRows(1, 1);
      ws.insertRow(1, [sheet.caption]);
      ws.insertRow(2, sheet.columns.map((c) => c.header));
      ws.getRow(1).font = { italic: true, size: 10, color: { argb: "FF6B7280" } };
    }

    const headerRow = ws.getRow(sheet.caption ? 2 : 1);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFF3F4F6" },
    };
    headerRow.alignment = { vertical: "middle" };

    for (const row of sheet.rows) {
      ws.addRow(sheet.columns.map((c) => row[c.key] ?? ""));
    }

    ws.autoFilter = {
      from: { row: sheet.caption ? 2 : 1, column: 1 },
      to: {
        row: sheet.caption ? 2 : 1,
        column: Math.max(sheet.columns.length, 1),
      },
    };
  }

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** `eduplus-students-2026-08-24.xlsx` — safe on every OS. */
export function fileName(parts: (string | null | undefined)[]): string {
  const slug = parts
    .filter(Boolean)
    .join("-")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return `${slug || "export"}.xlsx`;
}
