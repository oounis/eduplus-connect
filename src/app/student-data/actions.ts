"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { getT } from "@/lib/locale";
import { checkRateLimit, clearAttempts, recordFailure } from "@/lib/rate-limit";
import {
  DATA_COOKIE,
  dataCookieOptions,
  signDataSession,
  verifyDataSession,
} from "@/lib/data-session";
import { findSupervisor, resolveDataScope } from "@/lib/student-data";
import { CONTACT_FIELDS, CONTACT_LIMITS } from "@/lib/student-contact";

export type DataState = {
  error?: string;
  success?: string;
  /** Where the client should go next, after a successful PIN. */
  redirectTo?: string;
  /**
   * Echoed back so a mistyped PIN does not also clear the chosen name. Client
   * state cannot be relied on: a server action re-renders the route, which
   * replaces the client component and resets anything it held.
   */
  supervisorId?: string;
};

// Compared against when the chosen supervisor has no PIN, so "no PIN set"
// takes the same time as "wrong PIN" and cannot be told apart from outside.
const DUMMY_HASH = "$2a$10$58f8fbm.y2.rPjJ4FYQCreUNrGprfK5Nn./qMr0DXcVc2tzj8Aiji";

async function clientKey(): Promise<string> {
  const store = await headers();
  const forwarded = store.get("x-forwarded-for") ?? "";
  return forwarded.split(",")[0]?.trim() || store.get("x-real-ip") || "unknown";
}

/** Signs a supervisor in to their own students' data, and nothing else. */
export async function dataSignIn(
  _prev: DataState,
  formData: FormData,
): Promise<DataState> {
  const t = await getT();
  const supervisorId = String(formData.get("supervisorId") ?? "");
  const pin = String(formData.get("pin") ?? "");

  if (!supervisorId || !pin) {
    return { error: t("sd.chooseAndPin"), supervisorId };
  }

  // Two counters: one per supervisor (stops guessing one person's PIN) and one
  // per address (stops spraying one PIN across every supervisor).
  const ipKey = `data:ip:${await clientKey()}`;
  const personKey = `data:supervisor:${supervisorId}`;
  for (const key of [ipKey, personKey]) {
    const limit = checkRateLimit(key);
    if (!limit.allowed) {
      return {
        error: t("sd.tooMany", {
          minutes: Math.ceil(limit.retryAfterSeconds / 60),
        }),
        supervisorId,
      };
    }
  }

  const supervisor = await prisma.user.findFirst({
    where: { id: supervisorId, role: "SUPERVISOR", isActive: true },
    select: { id: true, firstName: true, lastName: true, quickPin: true },
  });

  const matches = await bcrypt.compare(pin, supervisor?.quickPin ?? DUMMY_HASH);
  if (!supervisor || !supervisor.quickPin || !matches) {
    recordFailure(ipKey);
    recordFailure(personKey);
    // One wording for every failure: a different message for "no such person"
    // would enumerate the staff list.
    return { error: t("sd.wrongPin"), supervisorId };
  }

  clearAttempts(ipKey);
  clearAttempts(personKey);

  const name = `${supervisor.firstName} ${supervisor.lastName}`;
  const jar = await cookies();
  jar.set(
    DATA_COOKIE,
    await signDataSession({ userId: supervisor.id, name }),
    dataCookieOptions,
  );

  await recordAudit(
    { userId: supervisor.id, name, role: "SUPERVISOR" },
    {
      action: "UPDATE",
      entity: "student",
      entityId: supervisor.id,
      summary: `${name} opened student data without signing in`,
    },
  );

  // Returned rather than thrown as a redirect(): a redirect from inside an
  // action consumed by useActionState does not reach the client, and a person
  // staring at an unchanged screen has no idea whether it worked.
  return { redirectTo: "/student-data/classes" };
}

export async function dataSignOut() {
  const jar = await cookies();
  // The path MUST match the one the cookie was set with. Deleting by name
  // alone targets path "/" and leaves the scoped cookie in place, so "Finish"
  // appears to work while the next person is still signed in as the last one.
  jar.delete({ name: DATA_COOKIE, path: dataCookieOptions.path });
  redirect("/student-data");
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function orNull(value: FormDataEntryValue | null): string | null {
  const text = String(value ?? "").trim();
  return text === "" ? null : text;
}

/**
 * Saves the contact details of every student in the class at once.
 *
 * The one button the request asked for. Which students may be written is
 * decided entirely by the session and the scope — the form carries a class id,
 * but a class that is not this supervisor's produces an empty roster and
 * therefore no writes at all. Field names are `phone:<studentId>`, and an id
 * that is not in the roster is simply not read.
 *
 * Only the four contact columns are ever written, the same four the signed-in
 * supervisor may edit on a student's profile (`lib/student-contact.ts`). This
 * action cannot rename a student, move them between classes or delete them.
 */
export async function saveStudentContacts(
  _prev: DataState,
  formData: FormData,
): Promise<DataState> {
  const t = await getT();
  const jar = await cookies();
  const session = await verifyDataSession(jar.get(DATA_COOKIE)?.value);
  if (!session) return { error: t("sd.expired") };

  const supervisor = await findSupervisor(session.userId);
  if (!supervisor) return { error: t("sd.expired") };

  const scope = await resolveDataScope(
    supervisor,
    String(formData.get("classId") ?? ""),
  );
  if (!scope.selectedClassId || scope.students.length === 0) {
    return { error: t("sd.noStudents") };
  }

  // Validate everything before writing anything: a bad address on the last
  // student must not leave the first twenty saved and the rest not.
  const updates: {
    id: string;
    name: string;
    next: Record<string, string | null>;
    changed: string[];
  }[] = [];

  for (const student of scope.students) {
    const next: Record<string, string | null> = {};
    for (const field of CONTACT_FIELDS) {
      // A student whose field is absent from the form — filtered out of the
      // table on screen — keeps the value it already has.
      const raw = formData.get(`${field}:${student.id}`);
      if (raw === null) continue;
      next[field] = orNull(raw);
    }

    const name = `${student.firstName} ${student.lastName}`;

    // Length before shape. Postgres `text` has no ceiling of its own, so
    // without this a crafted post writes as much as the 2 MB action body
    // allows into a phone number — thirty-five times over.
    for (const field of CONTACT_FIELDS) {
      const value = next[field];
      if (value && value.length > CONTACT_LIMITS[field]) {
        return { error: t("sd.tooLong", { name, n: CONTACT_LIMITS[field] }) };
      }
    }

    if (next.email && !EMAIL.test(next.email)) {
      return { error: t("sd.badEmail", { name }) };
    }

    const changed = Object.keys(next).filter(
      (field) => (student[field as keyof typeof student] ?? null) !== next[field],
    );
    if (changed.length > 0) {
      updates.push({ id: student.id, name, next, changed });
    }
  }

  if (updates.length === 0) return { success: t("sd.noChanges") };

  await prisma.$transaction(
    updates.map((update) =>
      prisma.student.update({ where: { id: update.id }, data: update.next }),
    ),
  );

  const actor = {
    userId: supervisor.id,
    name: `${supervisor.firstName} ${supervisor.lastName}`,
    role: "SUPERVISOR" as const,
  };
  // One line per student, the same granularity the signed-in form writes, and
  // marked as having come from the no-login page so the history says how.
  for (const update of updates) {
    await recordAudit(actor, {
      action: "UPDATE",
      entity: "student",
      entityId: update.id,
      summary: `Updated ${update.changed.join(", ")} for ${update.name} via student data`,
    });
  }

  // Deliberately no revalidatePath of this route. The values on screen are
  // already the ones just saved, and revalidating replaces this subtree, which
  // is how a save ends up invisible in a production build. The success message
  // is what has to survive, and it does.
  return { success: t("sd.saved", { n: updates.length }) };
}
