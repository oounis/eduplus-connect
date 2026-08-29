"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { assertModule } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { ROLES } from "@/lib/constants";

export type ActionState = { error?: string; success?: string };

const userSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required"),
  lastName: z.string().trim().min(1, "Last name is required"),
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  phone: z.string().trim().optional(),
  role: z.enum(ROLES),
});

export async function createUser(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await assertModule("users");

  const parsed = userSchema
    .extend({ password: z.string().min(8, "Password must be at least 8 characters") })
    .safeParse({
      firstName: formData.get("firstName"),
      lastName: formData.get("lastName"),
      email: formData.get("email"),
      phone: formData.get("phone") ?? "",
      role: formData.get("role"),
      password: formData.get("password"),
    });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid details" };
  }

  const existing = await prisma.user.findUnique({
    where: { email: parsed.data.email },
  });
  if (existing) return { error: "That email address is already in use" };

  const { password, phone, ...rest } = parsed.data;
  const created = await prisma.user.create({
    data: {
      ...rest,
      phone: phone || null,
      passwordHash: await bcrypt.hash(password, 10),
    },
  });

  await recordAudit(actor, {
    action: "CREATE",
    entity: "user",
    entityId: created.id,
    summary: `Created ${rest.role.toLowerCase()} account ${rest.firstName} ${rest.lastName} (${rest.email})`,
  });

  return { success: `${rest.firstName} ${rest.lastName} was added` };
}

export async function updateUser(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await assertModule("users");

  const id = String(formData.get("id") ?? "");
  const parsed = userSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    email: formData.get("email"),
    phone: formData.get("phone") ?? "",
    role: formData.get("role"),
  });
  if (!id) return { error: "Missing user" };
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid details" };
  }

  const clash = await prisma.user.findFirst({
    where: { email: parsed.data.email, NOT: { id } },
  });
  if (clash) return { error: "That email address is already in use" };

  const { phone, ...rest } = parsed.data;
  const before = await prisma.user.findUnique({ where: { id } });
  await prisma.user.update({
    where: { id },
    data: { ...rest, phone: phone || null },
  });

  await recordAudit(actor, {
    action: "UPDATE",
    entity: "user",
    entityId: id,
    summary:
      before && before.role !== rest.role
        ? `Changed ${rest.firstName} ${rest.lastName} from ${before.role.toLowerCase()} to ${rest.role.toLowerCase()}`
        : `Edited the account of ${rest.firstName} ${rest.lastName}`,
  });

  return { success: "Changes saved" };
}

export async function toggleUserActive(formData: FormData) {
  const actor = await assertModule("users");
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) return;

  // Guard: never let an admin lock themselves out.
  if (user.id === actor.userId) return;

  await prisma.user.update({
    where: { id },
    data: { isActive: !user.isActive },
  });
  await recordAudit(actor, {
    action: "UPDATE",
    entity: "user",
    entityId: id,
    summary: `${user.isActive ? "Deactivated" : "Reactivated"} ${user.firstName} ${user.lastName}`,
  });
  revalidatePath("/users");
}

export async function resetPassword(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await assertModule("users");
  const id = String(formData.get("id") ?? "");
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters" };
  }
  const target = await prisma.user.findUnique({ where: { id } });
  await prisma.user.update({
    where: { id },
    data: { passwordHash: await bcrypt.hash(password, 10) },
  });
  await recordAudit(actor, {
    action: "RESET",
    entity: "user",
    entityId: id,
    summary: `Reset the password of ${target?.firstName ?? "a user"} ${target?.lastName ?? ""}`.trim(),
  });
  return { success: "Password reset" };
}

export async function deleteUser(formData: FormData) {
  const actor = await assertModule("users");
  const id = String(formData.get("id") ?? "");
  if (!id || id === actor.userId) return;
  const target = await prisma.user.findUnique({ where: { id } });
  await prisma.user.delete({ where: { id } });
  await recordAudit(actor, {
    action: "DELETE",
    entity: "user",
    entityId: id,
    summary: `Deleted the account of ${target?.firstName ?? "a user"} ${target?.lastName ?? ""} (${target?.email ?? "unknown"})`,
  });
  revalidatePath("/users");
}
