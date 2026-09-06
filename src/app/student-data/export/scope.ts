import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { DATA_COOKIE, verifyDataSession } from "@/lib/data-session";
import { recordAudit } from "@/lib/audit";
import {
  findSupervisor,
  loadRoster,
  resolveDataScope,
  type DataScope,
  type DataSupervisor,
  type RosterStudent,
} from "@/lib/student-data";

/**
 * The one place the three exports decide what they are allowed to read.
 *
 * All of them are POSTs from the workspace, all of them carry a class id, a
 * scope and a list of ticked students, and all of them must answer the same
 * question: which students may this token see? Written once, so an export can
 * never widen while the page it was launched from stays narrow.
 *
 * The order matters. The class list comes from the supervisor's assignments,
 * the requested class is filtered against it, and the ticked student ids only
 * ever narrow that result — `loadRoster` keeps the class filter regardless of
 * what ids were posted, so a forged id belonging to another class returns
 * nothing rather than that student.
 */
export type ExportScope = {
  /** The parsed body, for the fields each export needs beyond the scope. */
  formData: FormData;
  supervisor: DataSupervisor;
  scope: DataScope;
  /** The classes this export covers: one, or all of the supervisor's. */
  classIds: string[];
  students: RosterStudent[];
  /** Human-readable, for the caption inside the workbook. */
  label: string;
};

/**
 * The body, or an empty one.
 *
 * `request.formData()` THROWS on a request whose body is not a form — no body
 * at all, or the wrong content type. Left to propagate that is a 500, which is
 * both the wrong answer (nothing was wrong with the server) and noise in the
 * logs for anything that pokes the URL. Found in production: a bare
 * `curl -X POST` returned 500 where the same request from the page returned a
 * redirect, because every test had posted a well-formed body.
 *
 * An empty form carries no session and no class, so it falls through to the
 * same refusal as any other request without one.
 */
async function readForm(request: NextRequest): Promise<FormData> {
  try {
    return await request.formData();
  } catch {
    return new FormData();
  }
}

export async function resolveExportScope(
  request: NextRequest,
  labels: { thisClass: (name: string) => string; allClasses: string },
): Promise<{ ok: false; response: NextResponse } | { ok: true } & ExportScope> {
  const formData = await readForm(request);

  /*
   * These are form *navigations*, not fetches, so whatever comes back replaces
   * the page. A bare 401 body therefore reads as a blank white screen with two
   * words on it, and takes the open class, the ticked students and any typed
   * message with it. Sending them to the step that fixes the problem is both
   * kinder and no less strict — nothing is served either way.
   *
   * 303, so the browser follows it with a GET rather than re-posting.
   */
  const bounce = (to: string) =>
    NextResponse.redirect(new URL(to, request.nextUrl.origin), 303);

  const jar = await cookies();
  const session = await verifyDataSession(jar.get(DATA_COOKIE)?.value);
  if (!session) return { ok: false, response: bounce("/student-data") };

  const supervisor = await findSupervisor(session.userId);
  if (!supervisor) return { ok: false, response: bounce("/student-data") };

  const scope = await resolveDataScope(
    supervisor,
    String(formData.get("classId") ?? ""),
  );

  const wantsAll = String(formData.get("scope") ?? "class") === "all";
  const classIds = wantsAll
    ? scope.classIds
    : scope.selectedClassId
      ? [scope.selectedClassId]
      : [];

  // A session, but nothing to export: no class chosen, or none assigned. Back
  // to the workspace, which says which of the two it is.
  if (classIds.length === 0) {
    return { ok: false, response: bounce("/student-data/classes") };
  }

  // Ticked students, if any. An empty list means the whole scope, which is what
  // somebody who exports without ticking anything expects.
  const studentIds = formData
    .getAll("student")
    .map((value) => String(value))
    .filter(Boolean);

  const students = await loadRoster(classIds, studentIds);

  const selectedName =
    scope.classes.find((klass) => klass.id === scope.selectedClassId)?.name ?? "";
  const label = wantsAll ? labels.allClasses : labels.thisClass(selectedName);

  return { ok: true, formData, supervisor, scope, classIds, students, label };
}

/** One line of history per export: who took what, and how many rows. */
export async function auditExport(
  supervisor: DataSupervisor,
  summary: string,
): Promise<void> {
  await recordAudit(
    {
      userId: supervisor.id,
      name: `${supervisor.firstName} ${supervisor.lastName}`,
      role: "SUPERVISOR",
    },
    { action: "EXPORT", entity: "student", entityId: null, summary },
  );
}
