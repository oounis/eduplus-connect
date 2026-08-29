import { SignJWT, jwtVerify } from "jose";
import type { Role } from "./constants";

export const SESSION_COOKIE = "eduplus_session";
const MAX_AGE_SECONDS = 60 * 60 * 8; // 8 hours

export type SessionPayload = {
  userId: string;
  email: string;
  name: string;
  role: Role;
};

/** The placeholder in .env.example. Fine locally, fatal in production. */
const DEV_SECRET = "dev-secret-change-me-in-production-min-32-chars";

function secret(): Uint8Array {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 16) {
    throw new Error(
      "AUTH_SECRET is missing or too short — copy .env.example to .env",
    );
  }
  // Anyone who has read this repository can mint an administrator session if
  // production ships with the example key, and nothing about the running app
  // would look wrong. Refuse instead: a server that will not start is a far
  // cheaper failure than one that is quietly forgeable.
  if (process.env.NODE_ENV === "production") {
    if (value === DEV_SECRET) {
      throw new Error(
        "AUTH_SECRET is still the example value from .env.example. " +
          "Generate a real one: openssl rand -base64 48",
      );
    }
    if (value.length < 32) {
      throw new Error(
        "AUTH_SECRET must be at least 32 characters in production. " +
          "Generate one: openssl rand -base64 48",
      );
    }
  }
  return new TextEncoder().encode(value);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secret());
}

export async function verifySession(
  token: string | undefined,
): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (!payload.userId || !payload.role) return null;
    return {
      userId: String(payload.userId),
      email: String(payload.email),
      name: String(payload.name),
      role: payload.role as Role,
    };
  } catch {
    return null;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: MAX_AGE_SECONDS,
};
