"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { assertModule } from "@/lib/auth";
import { toDayKey } from "@/lib/dates";
import { ATTENDANCE_STATUSES } from "@/lib/constants";

export type ActionState = { error?: string; success?: string };

/** A supervisor may only write the register of a class assigned to them. */
async function canWriteClass(
  userId: string,
  role: string,
  classId: string,
): Promise<boolean> {
  if (role === "ADMIN" || role === "DEPUTY") return true;
  if (role !== "SUPERVISOR") return false;
  const link = await prisma.classSupervisor.findFirst({
    where: { userId, classId },
  });
  return Boolean(link);
}

/**
 * Saves the whole register in one submit. Each student is posted as
 * "status:<studentId>"; students left blank are skipped rather than defaulted.
 */
export async function saveAttendance(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await assertModule("attendance");

  const classId = String(formData.get("classId") ?? "");
  const dateValue = String(formData.get("date") ?? "");
  if (!classId || !dateValue) return { error: "Choose a class and a date" };

  if (!(await canWriteClass(user.userId, user.role, classId))) {
    return { error: "You are not the supervisor of this class" };
  }

  const date = toDayKey(dateValue);
  if (date.getTime() > toDayKey(new Date()).getTime()) {
    return { error: "Attendance cannot be taken for a future date" };
  }

  const students = await prisma.student.findMany({
    where: { classId, isActive: true },
    select: { id: true },
  });

  const writes = [];
  for (const student of students) {
    const status = String(formData.get(`status:${student.id}`) ?? "");
    if (!status) continue;
    if (!ATTENDANCE_STATUSES.includes(status as never)) continue;
    const note = String(formData.get(`note:${student.id}`) ?? "").trim();

    writes.push(
      prisma.attendance.upsert({
        where: { studentId_date: { studentId: student.id, date } },
        update: { status, note: note || null, classId, recordedById: user.userId },
        create: {
          date,
          status,
          note: note || null,
          studentId: student.id,
          classId,
          recordedById: user.userId,
        },
      }),
    );
  }

  if (writes.length === 0) return { error: "No students were marked" };
  await prisma.$transaction(writes);

  revalidatePath("/attendance");
  revalidatePath("/dashboard");
  return {
    success: `Register saved — ${writes.length} ${writes.length === 1 ? "student" : "students"} recorded`,
  };
}
