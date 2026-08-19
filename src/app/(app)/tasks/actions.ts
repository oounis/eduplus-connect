"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { assertModule } from "@/lib/auth";
import { TASK_PRIORITIES, TASK_STATUSES } from "@/lib/constants";

export type ActionState = { error?: string; success?: string };

const schema = z.object({
  title: z.string().trim().min(3, "Give the task a title"),
  description: z.string().trim().optional(),
  assigneeId: z.string().min(1, "Choose who this is for"),
  priority: z.enum(TASK_PRIORITIES),
  dueDate: z.string().optional(),
});

export async function createTask(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await assertModule("tasks");

  const parsed = schema.safeParse({
    title: formData.get("title"),
    description: formData.get("description") ?? "",
    assigneeId: formData.get("assigneeId"),
    priority: formData.get("priority"),
    dueDate: formData.get("dueDate") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid details" };
  }

  const assignee = await prisma.user.findUnique({
    where: { id: parsed.data.assigneeId },
  });
  if (!assignee) return { error: "That user no longer exists" };

  await prisma.task.create({
    data: {
      title: parsed.data.title,
      description: parsed.data.description || null,
      assigneeId: parsed.data.assigneeId,
      priority: parsed.data.priority,
      dueDate: parsed.data.dueDate
        ? new Date(`${parsed.data.dueDate}T00:00:00.000Z`)
        : null,
      createdById: user.userId,
    },
  });

  revalidatePath("/tasks");
  return { success: `Task assigned to ${assignee.firstName}` };
}

/**
 * Status changes are open to the assignee too, so staff can progress their own
 * work without edit rights on the whole module.
 */
export async function updateTaskStatus(formData: FormData) {
  const user = await assertModule("tasks", "view");

  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!id || !TASK_STATUSES.includes(status as never)) return;

  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) return;

  const isAssignee = task.assigneeId === user.userId;
  if (!isAssignee && !user.access.tasks.edit) return;

  await prisma.task.update({ where: { id }, data: { status } });
  revalidatePath("/tasks");
}

export async function deleteTask(formData: FormData) {
  await assertModule("tasks");
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.task.delete({ where: { id } });
  revalidatePath("/tasks");
}
