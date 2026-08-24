import { prisma } from "./db";
import { getVisibleClassIds } from "./queries";
import type { CurrentUser } from "./auth";

/**
 * Who may edit a student's contact details.
 *
 * The access model is one `{ view, edit }` pair per module, which cannot say
 * "edit four named fields and nothing else". Rather than widen
 * `students.edit` for supervisors — that would also let them rename students,
 * move them between classes and delete them — contact editing gets its own
 * authorisation path:
 *
 *   - anyone who already holds `students.edit` (admin, deputy, staff)
 *   - a SUPERVISOR, but only for students in a class they are assigned to
 *
 * `students.edit` stays `false` for SUPERVISOR in the role defaults. The four
 * contact fields are the only thing this path can write.
 */

export const CONTACT_FIELDS = ["email", "phone", "phone2", "phone3"] as const;
export type ContactField = (typeof CONTACT_FIELDS)[number];

export type ContactPermission =
  | { allowed: true; reason: "module" | "supervisor" }
  | { allowed: false; reason: "no-access" | "not-my-class" | "no-student" };

export async function canEditStudentContact(
  user: Pick<CurrentUser, "userId" | "role" | "access">,
  studentId: string,
): Promise<ContactPermission> {
  // Full students.edit covers it already.
  if (user.access.students?.edit) return { allowed: true, reason: "module" };

  // Supervisors need both: the module in view, and this student in their classes.
  if (user.role !== "SUPERVISOR" || !user.access.students?.view) {
    return { allowed: false, reason: "no-access" };
  }

  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: { classId: true },
  });
  if (!student) return { allowed: false, reason: "no-student" };
  if (!student.classId) return { allowed: false, reason: "not-my-class" };

  const visible = await getVisibleClassIds(user);
  if (visible === "ALL") return { allowed: true, reason: "supervisor" };
  return visible.includes(student.classId)
    ? { allowed: true, reason: "supervisor" }
    : { allowed: false, reason: "not-my-class" };
}

/**
 * Whether to render the contact form at all. Cheap check for a list page —
 * it answers "could this user edit some student's contact details", not
 * "this particular one".
 */
export function mayEditSomeContact(
  user: Pick<CurrentUser, "role" | "access">,
): boolean {
  if (user.access.students?.edit) return true;
  return user.role === "SUPERVISOR" && Boolean(user.access.students?.view);
}

export function contactDenialMessage(
  reason: Exclude<ContactPermission, { allowed: true }>["reason"],
): string {
  switch (reason) {
    case "not-my-class":
      return "You can only edit contact details for students in the classes assigned to you";
    case "no-student":
      return "That student no longer exists";
    default:
      return "You are not allowed to edit student contact details";
  }
}
