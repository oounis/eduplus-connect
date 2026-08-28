"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { assertModule } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { getT } from "@/lib/locale";
import { getPeriodContext } from "@/lib/periods";
import { ATTENDANCE_STATUSES } from "@/lib/constants";

export type ActionState = { error?: string; success?: string };

/**
 * Saves one class's register for one period.
 *
 * The write rule is re-derived here through `getPeriodContext` rather than
 * trusted from the form: the page and this action then answer "may this person
 * write?" with the same code, and a form left open past the end of the period
 * cannot post into a closed register.
 */
export async function savePeriodAttendance(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await assertModule("periodAttendance");
  const t = await getT();

  const classId = String(formData.get("classId") ?? "");
  const periodId = String(formData.get("periodId") ?? "");
  const date = String(formData.get("date") ?? "");
  const teacherId = String(formData.get("teacherId") ?? "");

  const context = await getPeriodContext(user, {
    classId,
    periodId,
    date,
    teacherId: teacherId || undefined,
  });

  // The form must be describing the same register the server just resolved.
  if (
    context.selectedClassId !== classId ||
    context.selectedPeriod?.id !== periodId ||
    context.dateISO !== date
  ) {
    return { error: t("pa.lock.no-class") };
  }

  if (!context.access.canWrite) {
    return { error: t(`pa.lock.${context.access.reason}`) };
  }

  const writes = [];
  for (const student of context.students) {
    const status = String(formData.get(`status:${student.id}`) ?? "");
    if (!status) continue;
    if (!ATTENDANCE_STATUSES.includes(status as never)) continue;
    const note = String(formData.get(`note:${student.id}`) ?? "").trim();

    writes.push(
      prisma.periodAttendance.upsert({
        where: {
          studentId_date_periodId: {
            studentId: student.id,
            date: context.dateKey,
            periodId,
          },
        },
        update: {
          status,
          note: note || null,
          classId,
          recordedById: user.userId,
        },
        create: {
          date: context.dateKey,
          status,
          note: note || null,
          studentId: student.id,
          classId,
          periodId,
          recordedById: user.userId,
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
  const isCorrection = user.role === "ADMIN" || user.role === "DEPUTY";
  await recordAudit(user, {
    action: "UPDATE",
    entity: "periodAttendance",
    entityId: classId,
    summary:
      `${isCorrection ? "Corrected" : "Saved"} ${context.selectedPeriod?.name}` +
      ` for ${klass?.name ?? "a class"} on ${context.dateISO}` +
      ` — ${writes.length} student(s)`,
  });

  revalidatePath("/period-attendance");
  revalidatePath("/period-reports");
  return { success: t("pa.saved", { n: writes.length }) };
}
