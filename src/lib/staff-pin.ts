/**
 * The short PIN that lets one member of staff reach exactly one page without
 * an email and password.
 *
 * Two pages use it, and they are the only two:
 *
 *   - a TEACHER opens the period register on a shared classroom device
 *     (`/quick`, see `quick-session.ts`)
 *   - a SUPERVISOR opens student data for their own classes
 *     (`/student-data`, see `data-session.ts`)
 *
 * The rules live here rather than beside either page because they are the same
 * rules, and because one of them — the length — is quoted in the interface, in
 * the admin form's `pattern` and in both sign-in forms. Two copies of "six"
 * would eventually be a five and a six.
 *
 * The hash is stored in `User.quickPin`. The column keeps its original name so
 * that widening it from teachers to supervisors needed no migration on a live
 * school database; what it means is "this person's staff PIN", and which page
 * it opens is decided by their role, never by the token.
 */

/**
 * Short enough to type on a phone between lessons, long enough that guessing
 * it is impractical once the rate limiter is counting: six digits is a million
 * combinations against a five-attempt lockout.
 */
export const STAFF_PIN_LENGTH = 6;

/** Roles a PIN may be issued to. Anything else is refused by `setQuickPin`. */
export const PIN_ROLES = ["TEACHER", "SUPERVISOR"] as const;
export type PinRole = (typeof PIN_ROLES)[number];

export function isPinRole(role: string): role is PinRole {
  return (PIN_ROLES as readonly string[]).includes(role);
}

export function isValidPinFormat(pin: string): boolean {
  return new RegExp(`^\\d{${STAFF_PIN_LENGTH}}$`).test(pin);
}

/** Rejects the PINs people actually choose when left to themselves. */
export function isWeakPin(pin: string): boolean {
  if (/^(\d)\1+$/.test(pin)) return true; // 000000, 111111
  const ascending = "0123456789012345";
  const descending = "9876543210987654";
  return ascending.includes(pin) || descending.includes(pin);
}
