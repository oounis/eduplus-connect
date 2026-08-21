// Throttling for credential endpoints.
//
// Counters live in the process, which matches how this app is deployed today:
// a single instance. A restart clears them, and a second instance would count
// separately — acceptable, because the goal is to make online password guessing
// impractical, not to be an exact quota. If this ever runs on more than one
// instance, move the store to the database.

type Attempt = { count: number; firstAt: number; blockedUntil?: number };

const attempts = new Map<string, Attempt>();

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const BLOCK_MS = 15 * 60 * 1000;
// Without a sweep, one key per attacker-chosen email would live forever.
const SWEEP_MS = 5 * 60 * 1000;

let sweptAt = 0;

function sweep(now: number) {
  if (now - sweptAt < SWEEP_MS) return;
  sweptAt = now;
  for (const [key, entry] of attempts) {
    const expired = now - entry.firstAt > WINDOW_MS;
    const unblocked = !entry.blockedUntil || entry.blockedUntil < now;
    if (expired && unblocked) attempts.delete(key);
  }
}

export type RateLimitResult = { allowed: boolean; retryAfterSeconds: number };

/** Returns whether this key may attempt now, without recording an attempt. */
export function checkRateLimit(key: string): RateLimitResult {
  const now = Date.now();
  sweep(now);
  const entry = attempts.get(key);
  if (entry?.blockedUntil && entry.blockedUntil > now) {
    return { allowed: false, retryAfterSeconds: Math.ceil((entry.blockedUntil - now) / 1000) };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

/** Records one failed attempt, blocking the key once it passes the ceiling. */
export function recordFailure(key: string): void {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now - entry.firstAt > WINDOW_MS) {
    attempts.set(key, { count: 1, firstAt: now });
    return;
  }
  entry.count += 1;
  if (entry.count >= MAX_ATTEMPTS) entry.blockedUntil = now + BLOCK_MS;
}

/** Clears the counter after a genuine success, so one typo costs nothing. */
export function clearAttempts(key: string): void {
  attempts.delete(key);
}

/** Test seam: drops all state. */
export function resetRateLimit(): void {
  attempts.clear();
  sweptAt = 0;
}
