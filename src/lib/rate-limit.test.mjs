// Run with: node --test src/lib/
// Pure logic, no framework: the module has no imports of its own, so it is
// loaded straight from the TypeScript source with the types stripped.
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const source = await readFile(resolve(here, "rate-limit.ts"), "utf8");
const js = source
  .replace(/^type Attempt =[\s\S]*?;$/m, "")
  .replace(/^export type RateLimitResult =[\s\S]*?;$/m, "")
  .replace(/: RateLimitResult/g, "")
  .replace(/new Map<string, Attempt>\(\)/, "new Map()")
  .replace(/\(key: string\)/g, "(key)")
  .replace(/\(now: number\)/g, "(now)")
  .replace(/: void/g, "");
const { checkRateLimit, recordFailure, clearAttempts, resetRateLimit } =
  await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);

test("a fresh key is allowed", () => {
  resetRateLimit();
  assert.equal(checkRateLimit("ip:1.1.1.1").allowed, true);
});

test("five failures block the key", () => {
  resetRateLimit();
  for (let i = 0; i < 5; i += 1) {
    assert.equal(checkRateLimit("ip:2.2.2.2").allowed, true, `attempt ${i + 1} should still be allowed`);
    recordFailure("ip:2.2.2.2");
  }
  const blocked = checkRateLimit("ip:2.2.2.2");
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSeconds > 0);
});

test("a success clears the counter, so a typo costs nothing", () => {
  resetRateLimit();
  recordFailure("ip:3.3.3.3");
  recordFailure("ip:3.3.3.3");
  clearAttempts("ip:3.3.3.3");
  for (let i = 0; i < 4; i += 1) recordFailure("ip:3.3.3.3");
  assert.equal(checkRateLimit("ip:3.3.3.3").allowed, true);
});

test("keys are independent: one blocked account does not block another", () => {
  resetRateLimit();
  for (let i = 0; i < 5; i += 1) recordFailure("email:cible@example.com");
  assert.equal(checkRateLimit("email:cible@example.com").allowed, false);
  assert.equal(checkRateLimit("email:autre@example.com").allowed, true);
});
