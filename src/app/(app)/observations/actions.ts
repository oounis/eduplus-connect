"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { assertModule } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { toDayKey } from "@/lib/dates";
import { OBSERVATION_CATEGORIES, SENTIMENTS } from "@/lib/constants";

export type ActionState = { error?: string; success?: string };

/** A teacher may only write observations for a class assigned to them. */
async function canWriteClass(
  userId: string,
  role: string,
  classId: string,
): Promise<boolean> {
  if (role === "ADMIN" || role === "DEPUTY") return true;
  if (role !== "TEACHER") return false;
  const link = await prisma.classTeacher.findFirst({
    where: { userId, classId },
  });
  return Boolean(link);
}

const schema = z.object({
  classId: z.string().min(1, "Choose a class"),
  studentId: z.string().min(1, "Choose a student"),
  date: z.string().min(1, "Choose a date"),
  category: z.enum(OBSERVATION_CATEGORIES),
  sentiment: z.enum(SENTIMENTS),
  note: z.string().trim().min(3, "Write at least a short note"),
});

export async function createObservation(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await assertModule("observations");

  const parsed = schema.safeParse({
    classId: formData.get("classId"),
    studentId: formData.get("studentId"),
    date: formData.get("date"),
    category: formData.get("category"),
    sentiment: formData.get("sentiment"),
    note: formData.get("note"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid details" };
  }

  if (!(await canWriteClass(user.userId, user.role, parsed.data.classId))) {
    return { error: "You do not teach this class" };
  }

  const date = toDayKey(parsed.data.date);
  if (date.getTime() > toDayKey(new Date()).getTime()) {
    return { error: "Observations cannot be dated in the future" };
  }

  // Guard against a stale student list pointing at another class.
  const student = await prisma.student.findUnique({
    where: { id: parsed.data.studentId },
    select: { classId: true },
  });
  if (!student || student.classId !== parsed.data.classId) {
    return { error: "That student is not in the selected class" };
  }

  await prisma.observation.create({
    data: {
      date,
      classId: parsed.data.classId,
      studentId: parsed.data.studentId,
      category: parsed.data.category,
      sentiment: parsed.data.sentiment,
      note: parsed.data.note,
      authorId: user.userId,
    },
  });

  revalidatePath("/observations");
  revalidatePath("/dashboard");
  return { success: "Observation added" };
}

export async function deleteObservation(formData: FormData) {
  const user = await assertModule("observations");
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const observation = await prisma.observation.findUnique({ where: { id } });
  if (!observation) return;

  // Authors delete their own; admin and deputy can delete any.
  const privileged = user.role === "ADMIN" || user.role === "DEPUTY";
  if (!privileged && observation.authorId !== user.userId) return;

  await prisma.observation.delete({ where: { id } });
  await recordAudit(user, {
    action: "DELETE",
    entity: "observation",
    entityId: id,
    summary: `Deleted a ${observation.sentiment.toLowerCase()} ${observation.category.toLowerCase()} observation`,
  });
  revalidatePath("/observations");
  revalidatePath("/dashboard");
}
