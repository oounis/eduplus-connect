"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { assertModule } from "@/lib/auth";

export type ActionState = { error?: string; success?: string };

const dateString = z.string().min(1, "Required");

const yearSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required"),
    startDate: dateString,
    endDate: dateString,
  })
  .refine((v) => new Date(v.endDate) > new Date(v.startDate), {
    message: "End date must come after the start date",
  });

export async function createAcademicYear(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await assertModule("academic");

  const parsed = yearSchema.safeParse({
    name: formData.get("name"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid details" };
  }

  const existing = await prisma.academicYear.findUnique({
    where: { name: parsed.data.name },
  });
  if (existing) return { error: "An academic year with that name already exists" };

  const isFirst = (await prisma.academicYear.count()) === 0;
  await prisma.academicYear.create({
    data: {
      name: parsed.data.name,
      startDate: new Date(`${parsed.data.startDate}T00:00:00.000Z`),
      endDate: new Date(`${parsed.data.endDate}T00:00:00.000Z`),
      isCurrent: isFirst,
    },
  });

  revalidatePath("/academic");
  return { success: `${parsed.data.name} was created` };
}

export async function setCurrentYear(formData: FormData) {
  await assertModule("academic");
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await prisma.$transaction([
    prisma.academicYear.updateMany({ data: { isCurrent: false } }),
    prisma.academicYear.update({ where: { id }, data: { isCurrent: true } }),
  ]);

  revalidatePath("/academic");
  revalidatePath("/dashboard");
  revalidatePath("/classes");
}

export async function deleteAcademicYear(formData: FormData) {
  await assertModule("academic");
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const year = await prisma.academicYear.findUnique({
    where: { id },
    include: { _count: { select: { classes: true } } },
  });
  // Refuse to delete a year that still holds classes, or the current one.
  if (!year || year.isCurrent || year._count.classes > 0) return;

  await prisma.academicYear.delete({ where: { id } });
  revalidatePath("/academic");
}

const termSchema = z
  .object({
    academicYearId: z.string().min(1, "Choose an academic year"),
    name: z.string().trim().min(1, "Name is required"),
    startDate: dateString,
    endDate: dateString,
  })
  .refine((v) => new Date(v.endDate) > new Date(v.startDate), {
    message: "End date must come after the start date",
  });

export async function createTerm(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await assertModule("academic");

  const parsed = termSchema.safeParse({
    academicYearId: formData.get("academicYearId"),
    name: formData.get("name"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid details" };
  }

  const clash = await prisma.term.findFirst({
    where: {
      academicYearId: parsed.data.academicYearId,
      name: parsed.data.name,
    },
  });
  if (clash) return { error: "That year already has a term with this name" };

  await prisma.term.create({
    data: {
      academicYearId: parsed.data.academicYearId,
      name: parsed.data.name,
      startDate: new Date(`${parsed.data.startDate}T00:00:00.000Z`),
      endDate: new Date(`${parsed.data.endDate}T00:00:00.000Z`),
    },
  });

  revalidatePath("/academic");
  return { success: `${parsed.data.name} was added` };
}

export async function deleteTerm(formData: FormData) {
  await assertModule("academic");
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await prisma.term.delete({ where: { id } });
  revalidatePath("/academic");
}
