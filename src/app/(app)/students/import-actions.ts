"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { assertModule } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";

export type ImportRow = {
  line: number;
  firstName: string;
  lastName: string;
  code: string;
  dateOfBirth: string | null;
  className: string;
  parentEmail: string;
  problem: string | null;
};

export type ImportState = {
  error?: string;
  success?: string;
  /** Filled on a dry run so the user sees exactly what would happen. */
  preview?: {
    rows: ImportRow[];
    ok: number;
    skipped: number;
    csv: string;
  };
};

const HEADERS = ["firstname", "lastname", "code", "dateofbirth", "class", "parentemail"];

/** Minimal RFC 4180 reader — quoted fields, doubled quotes, CRLF or LF. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += char;
      continue;
    }
    if (char === '"') { quoted = true; continue; }
    if (char === ",") { row.push(field); field = ""; continue; }
    if (char === "\r") continue;
    if (char === "\n") { row.push(field); rows.push(row); row = []; field = ""; continue; }
    field += char;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

function normaliseDate(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  // Accept 2015-04-23 and 23/04/2015 — the two a school office actually types.
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(trimmed);
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  }
  return null;
}

async function nextCodeSequence(): Promise<number> {
  const last = await prisma.student.findFirst({
    orderBy: { code: "desc" },
    select: { code: true },
  });
  return last ? Number(last.code.replace(/\D/g, "")) || 0 : 0;
}

/**
 * Reads the pasted CSV and reports what would happen. Nothing is written:
 * the same text is handed back so the confirm step imports exactly what was
 * shown.
 */
export async function previewImport(
  _prev: ImportState,
  formData: FormData,
): Promise<ImportState> {
  await assertModule("students");
  const csv = String(formData.get("csv") ?? "").trim();
  if (!csv) return { error: "Paste some CSV first" };

  const rows = parseCsv(csv);
  if (rows.length < 2) {
    return { error: "The CSV needs a header row and at least one student" };
  }

  const header = rows[0].map((h) => h.trim().toLowerCase().replace(/[\s_-]/g, ""));
  const missing = ["firstname", "lastname"].filter((h) => !header.includes(h));
  if (missing.length > 0) {
    return {
      error: `The header row must contain ${HEADERS.join(", ")} — missing: ${missing.join(", ")}`,
    };
  }
  const at = (row: string[], key: string) => {
    const index = header.indexOf(key);
    return index === -1 ? "" : (row[index] ?? "").trim();
  };

  const [classes, parents, existingCodes] = await Promise.all([
    prisma.class.findMany({ select: { id: true, name: true } }),
    prisma.user.findMany({ where: { role: "PARENT" }, select: { id: true, email: true } }),
    prisma.student.findMany({ select: { code: true } }),
  ]);
  const classByName = new Map(classes.map((c) => [c.name.toLowerCase(), c]));
  const parentByEmail = new Map(parents.map((p) => [p.email.toLowerCase(), p]));
  const takenCodes = new Set(existingCodes.map((s) => s.code.toLowerCase()));

  let sequence = await nextCodeSequence();
  const seenInFile = new Set<string>();
  const parsed: ImportRow[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const firstName = at(row, "firstname");
    const lastName = at(row, "lastname");
    let code = at(row, "code");
    const rawDate = at(row, "dateofbirth");
    const className = at(row, "class");
    const parentEmail = at(row, "parentemail").toLowerCase();

    let problem: string | null = null;
    if (!firstName || !lastName) problem = "first and last name are required";
    else if (code && takenCodes.has(code.toLowerCase())) problem = `code ${code} already exists`;
    else if (code && seenInFile.has(code.toLowerCase())) problem = `code ${code} is repeated in this file`;
    else if (rawDate && !normaliseDate(rawDate)) problem = `date "${rawDate}" is not YYYY-MM-DD or DD/MM/YYYY`;
    else if (className && !classByName.has(className.toLowerCase())) problem = `no class called "${className}"`;
    else if (parentEmail && !parentByEmail.has(parentEmail)) problem = `no parent account for ${parentEmail}`;

    if (!problem && !code) {
      sequence += 1;
      code = `STU-${String(sequence).padStart(4, "0")}`;
    }
    if (!problem) seenInFile.add(code.toLowerCase());

    parsed.push({
      line: i + 1,
      firstName,
      lastName,
      code,
      dateOfBirth: rawDate ? normaliseDate(rawDate) : null,
      className,
      parentEmail,
      problem,
    });
  }

  const ok = parsed.filter((r) => !r.problem).length;
  return {
    preview: { rows: parsed, ok, skipped: parsed.length - ok, csv },
    success:
      ok === 0
        ? undefined
        : `${ok} of ${parsed.length} rows are ready to import`,
  };
}

/** Writes the rows that passed the preview. Bad rows are skipped, not guessed. */
export async function confirmImport(
  _prev: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const actor = await assertModule("students");
  const preview = await previewImport({}, formData);
  if (preview.error) return preview;
  if (!preview.preview || preview.preview.ok === 0) {
    return { error: "There is nothing valid to import" };
  }

  const [classes, parents] = await Promise.all([
    prisma.class.findMany({ select: { id: true, name: true } }),
    prisma.user.findMany({ where: { role: "PARENT" }, select: { id: true, email: true } }),
  ]);
  const classByName = new Map(classes.map((c) => [c.name.toLowerCase(), c.id]));
  const parentByEmail = new Map(parents.map((p) => [p.email.toLowerCase(), p.id]));

  const good = preview.preview.rows.filter((r) => !r.problem);
  await prisma.$transaction(
    good.map((row) =>
      prisma.student.create({
        data: {
          code: row.code,
          firstName: row.firstName,
          lastName: row.lastName,
          dateOfBirth: row.dateOfBirth
            ? new Date(`${row.dateOfBirth}T00:00:00.000Z`)
            : null,
          classId: row.className
            ? (classByName.get(row.className.toLowerCase()) ?? null)
            : null,
          parentId: row.parentEmail
            ? (parentByEmail.get(row.parentEmail) ?? null)
            : null,
        },
      }),
    ),
  );

  await recordAudit(actor, {
    action: "IMPORT",
    entity: "student",
    summary:
      `Imported ${good.length} ${good.length === 1 ? "student" : "students"} from CSV` +
      (preview.preview.skipped > 0
        ? ` (${preview.preview.skipped} rows skipped)`
        : ""),
  });

  revalidatePath("/students");
  revalidatePath("/classes");
  return {
    success: `Imported ${good.length} ${good.length === 1 ? "student" : "students"}${
      preview.preview.skipped > 0 ? `, skipped ${preview.preview.skipped}` : ""
    }`,
  };
}
