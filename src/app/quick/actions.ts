"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/audit";
import { getT } from "@/lib/locale";
import { checkRateLimit, clearAttempts, recordFailure } from "@/lib/rate-limit";
import {
  QUICK_COOKIE,
  quickCookieOptions,
  signQuickSession,
  verifyQuickSession,
} from "@/lib/quick-session";
import { getPeriodContext } from "@/lib/periods";
import { ATTENDANCE_STATUSES, MODULES } from "@/lib/constants";
import type { AccessMap } from "@/lib/auth";

export type QuickState = {
  error?: string;
  success?: string;
  /** Where the client should go next, after a successful PIN. */
  redirectTo?: string;
  /**
   * Echoed back so a mistyped PIN does not also clear the teacher's name.
   * Client state cannot be relied on here: a server action re-renders the
   * route, which replaces this client component and resets anything it held.
   */
  teacherId?: string;
};

/**
 * A fully-denied rights map with just the period register opened.
 *
 * Built explicitly rather than cast, so that adding a module to the app cannot
 * silently widen what quick access can reach: a new module starts denied here
 * like everywhere else.
 */
function quickAccess(): AccessMap {
  const access = Object.fromEntries(
    MODULES.map((key) => [key, { view: false, edit: false }]),
  ) as AccessMap;
  access.periodAttendance = { view: true, edit: true };
  return access;
}

// Compared against when the chosen teacher has no PIN, so "no PIN set" takes
// the same time as "wrong PIN" and cannot be told apart from the outside.
const DUMMY_HASH = "$2a$10$58f8fbm.y2.rPjJ4FYQCreUNrGprfK5Nn./qMr0DXcVc2tzj8Aiji";

async function clientKey(): Promise<string> {
  const store = await headers();
  const forwarded = store.get("x-forwarded-for") ?? "";
  return forwarded.split(",")[0]?.trim() || store.get("x-real-ip") || "unknown";
}

/** Signs a teacher in to the period register, and nothing else. */
export async function quickSignIn(
  _prev: QuickState,
  formData: FormData,
): Promise<QuickState> {
  const t = await getT();
  const teacherId = String(formData.get("teacherId") ?? "");
  const pin = String(formData.get("pin") ?? "");

  if (!teacherId || !pin) return { error: t("quick.chooseAndPin"), teacherId };

  // Two counters: one per teacher (stops guessing one person's PIN) and one
  // per address (stops spraying one PIN across every teacher).
  const ipKey = `quick:ip:${await clientKey()}`;
  const teacherKey = `quick:teacher:${teacherId}`;
  for (const key of [ipKey, teacherKey]) {
    const limit = checkRateLimit(key);
    if (!limit.allowed) {
      return {
        error: t("quick.tooMany", {
          minutes: Math.ceil(limit.retryAfterSeconds / 60),
        }),
        teacherId,
      };
    }
  }

  const teacher = await prisma.user.findFirst({
    where: { id: teacherId, role: "TEACHER", isActive: true },
    select: { id: true, firstName: true, lastName: true, quickPin: true },
  });

  const matches = await bcrypt.compare(pin, teacher?.quickPin ?? DUMMY_HASH);
  if (!teacher || !teacher.quickPin || !matches) {
    recordFailure(ipKey);
    recordFailure(teacherKey);
    // One wording for every failure: a different message for "no such teacher"
    // would enumerate the staff list.
    return { error: t("quick.wrongPin"), teacherId };
  }

  clearAttempts(ipKey);
  clearAttempts(teacherKey);

  const name = `${teacher.firstName} ${teacher.lastName}`;
  const token = await signQuickSession({ userId: teacher.id, name });
  const jar = await cookies();
  jar.set(QUICK_COOKIE, token, quickCookieOptions);

  await recordAudit(
    { userId: teacher.id, name, role: "TEACHER" },
    {
      action: "UPDATE",
      entity: "periodAttendance",
      entityId: teacher.id,
      summary: `${name} opened quick attendance from a shared device`,
    },
  );

  // Returned rather than thrown as a redirect(): a redirect from inside an
  // action consumed by useActionState did not reach the client here, and a
  // teacher staring at an unchanged screen has no idea whether it worked.
  // The client navigates on this.
  return { redirectTo: "/quick/register" };
}

export async function quickSignOut() {
  const jar = await cookies();
  // The path MUST match the one the cookie was set with. Deleting by name
  // alone targets path "/" and leaves a cookie scoped to "/quick" in place —
  // so "Finish" appeared to work while the next person to pick up the device
  // was still signed in as the previous teacher.
  jar.delete({ name: QUICK_COOKIE, path: quickCookieOptions.path });
  redirect("/quick");
}

/**
 * Saves the register for the live period.
 *
 * The teacher's identity comes from the signed cookie, never from the form, so
 * a crafted post cannot file attendance under somebody else's name. Everything
 * else — is this class theirs, is this period actually running — is decided by
 * the same `getPeriodContext` the signed-in page uses, so the two cannot drift
 * apart.
 */
export async function saveQuickAttendance(
  _prev: QuickState,
  formData: FormData,
): Promise<QuickState> {
  const t = await getT();
  const jar = await cookies();
  const session = await verifyQuickSession(jar.get(QUICK_COOKIE)?.value);
  if (!session) return { error: t("quick.expired") };

  const teacher = await prisma.user.findFirst({
    where: { id: session.userId, role: "TEACHER", isActive: true },
    select: { id: true, firstName: true, lastName: true, role: true },
  });
  if (!teacher) return { error: t("quick.expired") };

  const classId = String(formData.get("classId") ?? "");
  const periodId = String(formData.get("periodId") ?? "");

  const context = await getPeriodContext(
    // Quick access grants exactly this one right, and only through this
    // action. It is not a session, and it reaches nothing else.
    { userId: teacher.id, role: "TEACHER", access: quickAccess() },
    { classId, periodId, teacherId: teacher.id },
  );

  if (context.selectedClassId !== classId || context.selectedPeriod?.id !== periodId) {
    return { error: t("pa.lock.no-class") };
  }
  if (!context.access.canWrite) {
    return { error: t(`pa.lock.${context.access.reason}`) };
  }

  const writes = [];
  for (const student of context.students) {
    const status = String(formData.get(`status:${student.id}`) ?? "");
    if (!status || !ATTENDANCE_STATUSES.includes(status as never)) continue;
    writes.push(
      prisma.periodAttendance.upsert({
        where: {
          studentId_date_periodId: {
            studentId: student.id,
            date: context.dateKey,
            periodId,
          },
        },
        update: { status, classId, recordedById: teacher.id },
        create: {
          date: context.dateKey,
          status,
          studentId: student.id,
          classId,
          periodId,
          recordedById: teacher.id,
        },
      }),
    );
  }

  if (writes.length === 0) return { error: t("pa.lock.no-class") };
  await prisma.$transaction(writes);

  const klass = await prisma.class.findUnique({
    where: { id: classId },
    select: { name: true },
  });
  await recordAudit(
    { userId: teacher.id, name: `${teacher.firstName} ${teacher.lastName}`, role: "TEACHER" },
    {
      action: "UPDATE",
      entity: "periodAttendance",
      entityId: classId,
      // Marked as quick access, so the history shows how it was taken.
      summary:
        `Saved ${context.selectedPeriod?.name} for ${klass?.name ?? "a class"}` +
        ` on ${context.dateISO} via quick attendance — ${writes.length} student(s)`,
    },
  );

  return {
    success: t("pa.saved", { n: writes.length }),
  };
}
