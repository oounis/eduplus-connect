"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { assertModule, getCurrentUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import {
  canEditStudentContact,
  contactDenialMessage,
} from "@/lib/student-contact";

export type ActionState = { error?: string; success?: string };

const studentSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required"),
  lastName: z.string().trim().min(1, "Last name is required"),
  code: z.string().trim().optional(),
  dateOfBirth: z.string().optional(),
  classId: z.string().optional(),
  parentId: z.string().optional(),
});

/**
 * The four contact fields, on their own. Blank is allowed and stored as NULL —
 * clearing a wrong number has to be possible. An email that is present must
 * still look like an email.
 */
const contactSchema = z.object({
  email: z
    .string()
    .trim()
    .max(200)
    .refine((v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), {
      message: "That email address does not look right",
    }),
  phone: z.string().trim().max(40),
  phone2: z.string().trim().max(40),
  phone3: z.string().trim().max(40),
});

const orNull = (value: string) => (value.trim() === "" ? null : value.trim());

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
  const actor = await assertModule("students");

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

  const created = await prisma.student.create({
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

  await recordAudit(actor, {
    action: "CREATE",
    entity: "student",
    entityId: created.id,
    summary: `Enrolled ${parsed.data.firstName} ${parsed.data.lastName} (${code})`,
  });

  revalidatePath("/students");
  revalidatePath("/classes");
  return { success: `${parsed.data.firstName} ${parsed.data.lastName} was added` };
}

export async function updateStudent(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await assertModule("students");
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

  await recordAudit(actor, {
    action: "UPDATE",
    entity: "student",
    entityId: id,
    summary: `Edited the record of ${parsed.data.firstName} ${parsed.data.lastName}`,
  });

  revalidatePath("/students");
  revalidatePath("/classes");
  return { success: "Changes saved" };
}

/** Quick class move straight from the students table. */
export async function moveStudentToClass(formData: FormData) {
  const actor = await assertModule("students");
  const id = String(formData.get("id") ?? "");
  const classId = String(formData.get("classId") ?? "");
  if (!id) return;

  const student = await prisma.student.update({
    where: { id },
    data: { classId: classId || null },
    include: { class: { select: { name: true } } },
  });
  await recordAudit(actor, {
    action: "UPDATE",
    entity: "student",
    entityId: id,
    summary: `Moved ${student.firstName} ${student.lastName} to ${student.class?.name ?? "no class"}`,
  });
  revalidatePath("/students");
  revalidatePath("/classes");
}

export async function deleteStudent(formData: FormData) {
  const actor = await assertModule("students");
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const student = await prisma.student.findUnique({ where: { id } });
  await prisma.student.delete({ where: { id } });
  await recordAudit(actor, {
    action: "DELETE",
    entity: "student",
    entityId: id,
    summary: `Removed ${student?.firstName ?? "a student"} ${student?.lastName ?? ""} (${student?.code ?? "unknown"})`,
  });
  revalidatePath("/students");
  revalidatePath("/classes");
}

/**
 * Update only email / phone / phone2 / phone3.
 *
 * Deliberately separate from `updateStudent`: supervisors are allowed here and
 * nowhere else in this file, and this action cannot write any other column, so
 * widening it by accident is not possible. Authorisation is per student — being
 * a supervisor is not enough, the student has to be in one of their classes.
 */
export async function updateStudentContact(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await getCurrentUser();
  if (!actor) return { error: "Not signed in" };

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing student" };

  const permission = await canEditStudentContact(actor, id);
  if (!permission.allowed) return { error: contactDenialMessage(permission.reason) };

  const parsed = contactSchema.safeParse({
    email: formData.get("email") ?? "",
    phone: formData.get("phone") ?? "",
    phone2: formData.get("phone2") ?? "",
    phone3: formData.get("phone3") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid contact details" };
  }

  const before = await prisma.student.findUnique({
    where: { id },
    select: {
      firstName: true, lastName: true,
      email: true, phone: true, phone2: true, phone3: true,
    },
  });
  if (!before) return { error: "That student no longer exists" };

  const next = {
    email: orNull(parsed.data.email),
    phone: orNull(parsed.data.phone),
    phone2: orNull(parsed.data.phone2),
    phone3: orNull(parsed.data.phone3),
  };

  // Nothing changed — say so rather than writing a pointless audit entry.
  const changed = (["email", "phone", "phone2", "phone3"] as const).filter(
    (key) => (before[key] ?? null) !== next[key],
  );
  if (changed.length === 0) return { success: "No changes to save" };

  await prisma.student.update({ where: { id }, data: next });

  await recordAudit(actor, {
    action: "UPDATE",
    entity: "student",
    entityId: id,
    summary: `Updated ${changed.join(", ")} for ${before.firstName} ${before.lastName}`,
  });

  revalidatePath("/students");
  revalidatePath(`/students/${id}`);
  return { success: "Contact details saved" };
}
