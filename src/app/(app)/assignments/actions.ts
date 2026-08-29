"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { assertModule } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";

export type ActionState = { error?: string; success?: string };

/**
 * Replaces the full class list for one supervisor or teacher.
 * The form posts one "classIds" value per ticked class.
 */
export async function saveAssignments(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await assertModule("assignments");

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

  const names = await prisma.class.findMany({
    where: { id: { in: classIds } },
    select: { name: true },
    orderBy: { name: "asc" },
  });
  await recordAudit(actor, {
    action: "ASSIGN",
    entity: "assignment",
    entityId: userId,
    summary:
      `${kind === "SUPERVISOR" ? "Supervisor" : "Teacher"} ${user.firstName} ` +
      `${user.lastName} now covers ` +
      (names.length === 0
        ? "no classes"
        : names.map((c) => c.name).join(", ")),
  });

  revalidatePath("/classes");
  revalidatePath("/dashboard");
  return {
    success: `${user.firstName} ${user.lastName} now covers ${classIds.length} ${
      classIds.length === 1 ? "class" : "classes"
    }`,
  };
}
