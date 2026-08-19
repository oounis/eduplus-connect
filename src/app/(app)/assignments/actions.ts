"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { assertModule } from "@/lib/auth";

export type ActionState = { error?: string; success?: string };

/**
 * Replaces the full class list for one supervisor or teacher.
 * The form posts one "classIds" value per ticked class.
 */
export async function saveAssignments(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await assertModule("assignments");

  const userId = String(formData.get("userId") ?? "");
  const kind = String(formData.get("kind") ?? "");
  const classIds = formData.getAll("classIds").map(String).filter(Boolean);

  if (!userId || (kind !== "SUPERVISOR" && kind !== "TEACHER")) {
    return { error: "Missing user or assignment type" };
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { error: "User not found" };
  if (user.role !== kind) {
    return { error: `${user.firstName} is no longer a ${kind.toLowerCase()}` };
  }

  if (kind === "SUPERVISOR") {
    await prisma.$transaction([
      prisma.classSupervisor.deleteMany({ where: { userId } }),
      ...classIds.map((classId) =>
        prisma.classSupervisor.create({ data: { userId, classId } }),
      ),
    ]);
  } else {
    const subject = String(formData.get("subject") ?? "").trim();
    await prisma.$transaction([
      prisma.classTeacher.deleteMany({ where: { userId } }),
      ...classIds.map((classId) =>
        prisma.classTeacher.create({
          data: { userId, classId, subject: subject || null },
        }),
      ),
    ]);
  }

  revalidatePath("/assignments");
  revalidatePath("/classes");
  revalidatePath("/dashboard");
  return {
    success: `${user.firstName} ${user.lastName} now covers ${classIds.length} ${
      classIds.length === 1 ? "class" : "classes"
    }`,
  };
}
