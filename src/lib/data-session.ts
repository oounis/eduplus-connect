import { SignJWT, jwtVerify } from "jose";

/**
 * The student-data session: a supervisor on any device picks their name, types
 * their PIN, and lands on the contact details and registers of the classes
 * assigned to them — and nothing else in the school.
 *
 * ── Why a SEPARATE cookie and token, again ──────────────────────────────────
 *
 * The same reasoning as `quick-session.ts`, and for the same reason it is a
 * second file rather than a `scope` claim on the first: a teacher's quick token
 * and a supervisor's data token must not be interchangeable. They are signed
 * with different audiences, stored under different cookie names, and scoped to
 * different paths, so neither can be replayed at the other's pages — nor at a
 * full session — no matter what a future change forgets to check.
 *
 * ── Why there is a PIN at all ───────────────────────────────────────────────
 *
 * The request was for a page that needs no email login. Left fully open, this
 * one publishes every child's name, their guardians' phone numbers and their
 * email addresses to anyone who finds the URL, and lets any visitor overwrite
 * them. That is a larger exposure than the register: a roster is a list of
 * names, this is a contact database. So the same bargain as `/quick` — no
 * email and password, but a PIN — and the roster stays behind it. Only the
 * list of supervisor names is public, which is the minimum the "choose your
 * name" step needs.
 */

export const DATA_COOKIE = "eduplus_data";

/** A working session, short enough that a walk-away expires the same day. */
const MAX_AGE_SECONDS = 60 * 60 * 8;

/** Distinguishes these tokens from full sessions and from quick tokens. */
const AUDIENCE = "eduplus:student-data";

export type DataSession = {
  userId: string;
  name: string;
};

function secret(): Uint8Array {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 16) {
    throw new Error("AUTH_SECRET is missing or too short");
  }
  return new TextEncoder().encode(value);
}

export async function signDataSession(payload: DataSession): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setAudience(AUDIENCE)
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secret());
}

export async function verifyDataSession(
  token: string | undefined,
): Promise<DataSession | null> {
  if (!token) return null;
  try {
    // The audience check is what stops a quick token or a full session cookie
    // being replayed here, and vice versa.
    const { payload } = await jwtVerify(token, secret(), { audience: AUDIENCE });
    if (!payload.userId) return null;
    return {
      userId: String(payload.userId),
      name: String(payload.name ?? ""),
    };
  } catch {
    return null;
  }
}

export const dataCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/student-data",
  maxAge: MAX_AGE_SECONDS,
};
