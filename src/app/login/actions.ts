"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { checkRateLimit, clearAttempts, recordFailure } from "@/lib/rate-limit";
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

// A real bcrypt hash to compare against when the account does not exist.
// Skipping the compare returned "incorrect" in a fraction of the time it takes
// for a real account, which told an attacker which addresses are registered —
// the identical wording below was doing nothing on its own.
// Hash of 32 random bytes that were never recorded: nothing can match it.
const DUMMY_HASH = "$2a$10$58f8fbm.y2.rPjJ4FYQCreUNrGprfK5Nn./qMr0DXcVc2tzj8Aiji";

async function clientKey(): Promise<string> {
  const store = await headers();
  const forwarded = store.get("x-forwarded-for") ?? "";
  const ip = forwarded.split(",")[0]?.trim() || store.get("x-real-ip") || "unknown";
  return ip;
}

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

  // Throttle by address and by account: one blocks a single noisy source, the
  // other blocks a spread-out attack aimed at one inbox.
  const ipKey = `ip:${await clientKey()}`;
  const emailKey = `email:${parsed.data.email}`;
  for (const key of [ipKey, emailKey]) {
    const { allowed, retryAfterSeconds } = checkRateLimit(key);
    if (!allowed) {
      const minutes = Math.ceil(retryAfterSeconds / 60);
      return { error: `Too many attempts. Try again in ${minutes} minute${minutes > 1 ? "s" : ""}.` };
    }
  }

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email },
  });
  // Same message either way — do not reveal which accounts exist.
  const passwordOk = await bcrypt.compare(
    parsed.data.password,
    user?.passwordHash ?? DUMMY_HASH,
  );
  if (!user || !passwordOk) {
    recordFailure(ipKey);
    recordFailure(emailKey);
    return { error: "Email or password is incorrect" };
  }
  if (!user.isActive) {
    return { error: "This account has been deactivated. Contact an administrator." };
  }

  // Correct credentials: a legitimate user who mistyped twice starts clean.
  clearAttempts(ipKey);
  clearAttempts(emailKey);

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
