"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { assertModule } from "@/lib/auth";

export type ActionState = { error?: string; success?: string };

const classSchema = z.object({
  name: z.string().trim().min(1, "Class name is required"),
  level: z.string().trim().min(1, "Level is required"),
  room: z.string().trim().optional(),
  capacity: z.coerce.number().int().min(1).max(200),
  academicYearId: z.string().min(1, "Choose an academic year"),
});

export async function createClass(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await assertModule("classes");

  const parsed = classSchema.safeParse({
    name: formData.get("name"),
    level: formData.get("level"),
    room: formData.get("room") ?? "",
    capacity: formData.get("capacity"),
    academicYearId: formData.get("academicYearId"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid details" };
  }

  const clash = await prisma.class.findFirst({
    where: {
      academicYearId: parsed.data.academicYearId,
      name: parsed.data.name,
    },
  });
  if (clash) return { error: "That year already has a class with this name" };

  const { room, ...rest } = parsed.data;
  await prisma.class.create({ data: { ...rest, room: room || null } });

  revalidatePath("/classes");
  return { success: `${parsed.data.name} was created` };
}

export async function updateClass(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await assertModule("classes");
  const id = String(formData.get("id") ?? "");
  const parsed = classSchema.safeParse({
    name: formData.get("name"),
    level: formData.get("level"),
    room: formData.get("room") ?? "",
    capacity: formData.get("capacity"),
    academicYearId: formData.get("academicYearId"),
  });
  if (!id) return { error: "Missing class" };
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid details" };
  }

  const { room, ...rest } = parsed.data;
  await prisma.class.update({
    where: { id },
    data: { ...rest, room: room || null },
  });

  revalidatePath("/classes");
  revalidatePath(`/classes/${id}`);
  return { success: "Changes saved" };
}

export async function deleteClass(formData: FormData) {
  await assertModule("classes");
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const klass = await prisma.class.findUnique({
    where: { id },
    include: { _count: { select: { students: true } } },
  });
  // Do not orphan students silently — the class must be emptied first.
  if (!klass || klass._count.students > 0) return;

  await prisma.class.delete({ where: { id } });
  revalidatePath("/classes");
}
