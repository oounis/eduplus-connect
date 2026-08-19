"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { assertModule } from "@/lib/auth";

export type ActionState = { error?: string; success?: string };

const studentSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required"),
  lastName: z.string().trim().min(1, "Last name is required"),
  code: z.string().trim().optional(),
  dateOfBirth: z.string().optional(),
  classId: z.string().optional(),
  parentId: z.string().optional(),
});

async function nextStudentCode(): Promise<string> {
  const last = await prisma.student.findFirst({
    orderBy: { code: "desc" },
    select: { code: true },
  });
  const lastNumber = last ? Number(last.code.replace(/\D/g, "")) : 0;
  return `STU-${String(lastNumber + 1).padStart(4, "0")}`;
}

export async function createStudent(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await assertModule("students");

  const parsed = studentSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    code: formData.get("code") ?? "",
    dateOfBirth: formData.get("dateOfBirth") ?? "",
    classId: formData.get("classId") ?? "",
    parentId: formData.get("parentId") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid details" };
  }

  const code = parsed.data.code?.trim() || (await nextStudentCode());
  const clash = await prisma.student.findUnique({ where: { code } });
  if (clash) return { error: `Student code ${code} is already in use` };

  await prisma.student.create({
    data: {
      code,
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      dateOfBirth: parsed.data.dateOfBirth
        ? new Date(`${parsed.data.dateOfBirth}T00:00:00.000Z`)
        : null,
      classId: parsed.data.classId || null,
      parentId: parsed.data.parentId || null,
    },
  });

  revalidatePath("/students");
  revalidatePath("/classes");
  return { success: `${parsed.data.firstName} ${parsed.data.lastName} was added` };
}

export async function updateStudent(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await assertModule("students");
  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing student" };

  const parsed = studentSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    code: formData.get("code") ?? "",
    dateOfBirth: formData.get("dateOfBirth") ?? "",
    classId: formData.get("classId") ?? "",
    parentId: formData.get("parentId") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid details" };
  }

  if (parsed.data.code) {
    const clash = await prisma.student.findFirst({
      where: { code: parsed.data.code, NOT: { id } },
    });
    if (clash) return { error: "That student code is already in use" };
  }

  await prisma.student.update({
    where: { id },
    data: {
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      ...(parsed.data.code ? { code: parsed.data.code } : {}),
      dateOfBirth: parsed.data.dateOfBirth
        ? new Date(`${parsed.data.dateOfBirth}T00:00:00.000Z`)
        : null,
      classId: parsed.data.classId || null,
      parentId: parsed.data.parentId || null,
    },
  });

  revalidatePath("/students");
  revalidatePath("/classes");
  return { success: "Changes saved" };
}

/** Quick class move straight from the students table. */
export async function moveStudentToClass(formData: FormData) {
  await assertModule("students");
  const id = String(formData.get("id") ?? "");
  const classId = String(formData.get("classId") ?? "");
  if (!id) return;

  await prisma.student.update({
    where: { id },
    data: { classId: classId || null },
  });
  revalidatePath("/students");
  revalidatePath("/classes");
}

export async function deleteStudent(formData: FormData) {
  await assertModule("students");
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.student.delete({ where: { id } });
  revalidatePath("/students");
  revalidatePath("/classes");
}
