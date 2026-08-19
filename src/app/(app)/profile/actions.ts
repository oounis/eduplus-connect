"use server";

import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

export type ActionState = { error?: string; success?: string };

const schema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password"),
    newPassword: z.string().min(8, "The new password must be at least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: "The two new passwords do not match",
  })
  .refine((v) => v.newPassword !== v.currentPassword, {
    message: "The new password must be different from the current one",
  });

/** Any signed-in user may change their own password — no module grant needed. */
export async function changeOwnPassword(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await getCurrentUser();
  if (!session) return { error: "Your session has expired — sign in again" };

  const parsed = schema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid details" };
  }

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) return { error: "Account not found" };

  const ok = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
  if (!ok) return { error: "Your current password is not correct" };

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(parsed.data.newPassword, 10) },
  });

  return { success: "Your password was changed" };
}

const detailsSchema = z.object({
  phone: z.string().trim().max(40).optional(),
});

/** Contact number only — name, email and role stay with the administrator. */
export async function updateOwnDetails(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await getCurrentUser();
  if (!session) return { error: "Your session has expired — sign in again" };

  const parsed = detailsSchema.safeParse({ phone: formData.get("phone") ?? "" });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid details" };
  }

  await prisma.user.update({
    where: { id: session.userId },
    data: { phone: parsed.data.phone || null },
  });
  return { success: "Your details were saved" };
}
