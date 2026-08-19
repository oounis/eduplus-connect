"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  SESSION_COOKIE,
  sessionCookieOptions,
  signSession,
} from "@/lib/session";
import type { Role } from "@/lib/constants";

const schema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});

export type LoginState = { error?: string };

export async function login(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = schema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid details" };
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
  });
  // Same message either way — do not reveal which accounts exist.
  if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
    return { error: "Email or password is incorrect" };
  }
  if (!user.isActive) {
    return { error: "This account has been deactivated. Contact an administrator." };
  }

  const token = await signSession({
    userId: user.id,
    email: user.email,
    name: `${user.firstName} ${user.lastName}`,
    role: user.role as Role,
  });

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, sessionCookieOptions);
  redirect("/dashboard");
}

export async function logout() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  redirect("/login");
}
