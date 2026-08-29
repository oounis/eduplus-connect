import { SignJWT, jwtVerify } from "jose";

/**
 * The quick-attendance session: a teacher on a shared classroom device picks
 * their name, types a short PIN, and lands straight on the register for the
 * period running now.
 *
 * ── Why this is a SEPARATE cookie and a separate token ──────────────────────
 *
 * It would be less code to reuse the normal session with a "scope" claim. That
 * would also mean every `getCurrentUser()` in the application is one forgotten
 * check away from treating a PIN as a full sign-in. Instead the quick token
 * lives under its own cookie name, is signed with a distinct audience, and is
 * read by exactly two pages. Nothing else in the app looks at this cookie, so a
 * quick token cannot authenticate anything else — not by mistake, not by an
 * oversight in a future change.
 *
 * ── Why there is a PIN at all ───────────────────────────────────────────────
 *
 * The request was for a page reachable without logging in. Left fully open,
 * that page publishes the name of every child in the school to anyone who
 * finds the URL, and lets any visitor file attendance under a named teacher's
 * identity — which also makes the audit trail worthless. A short PIN keeps what
 * the request was actually for (no email and password on a shared device,
 * during a 45-minute period) without either of those consequences.
 */

export const QUICK_COOKIE = "eduplus_quick";

/** Long enough for a school day, short enough that a walk-away expires. */
const MAX_AGE_SECONDS = 60 * 60 * 8;

/** Distinguishes these tokens from full sessions signed with the same secret. */
const AUDIENCE = "eduplus:quick-attendance";

export type QuickSession = {
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

export async function signQuickSession(payload: QuickSession): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setAudience(AUDIENCE)
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secret());
}

export async function verifyQuickSession(
  token: string | undefined,
): Promise<QuickSession | null> {
  if (!token) return null;
  try {
    // Verifying the audience is what stops a full session cookie being
    // replayed here, and vice versa.
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

export const quickCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/quick",
  maxAge: MAX_AGE_SECONDS,
};

/**
 * PIN rules. Short enough to type on a phone between lessons, long enough that
 * guessing it is impractical once the rate limiter is counting: 6 digits is
 * a million combinations against a 5-attempt lockout.
 */
export const QUICK_PIN_LENGTH = 6;

export function isValidPinFormat(pin: string): boolean {
  return new RegExp(`^\\d{${QUICK_PIN_LENGTH}}$`).test(pin);
}

/** Rejects the PINs people actually choose when left to themselves. */
export function isWeakPin(pin: string): boolean {
  if (/^(\d)\1+$/.test(pin)) return true; // 000000, 111111
  const ascending = "0123456789012345";
  const descending = "9876543210987654";
  return ascending.includes(pin) || descending.includes(pin);
}
