// Run with: node --test src/lib/
//
// The launch fallback, tested without a browser. This is the whole reason the
// decision lives in its own module: the sandboxed case is the one that matters
// and the one you cannot reach on a machine where the sandbox works — every
// attempt to provoke it by hand (CHROME_DEVEL_SANDBOX, a bogus helper path)
// launched perfectly happily. A fake `launch` reaches it every time.
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const source = await readFile(resolve(here, "browser-fallback.ts"), "utf8");
const js = source
  .replace(/^type Launch =[\s\S]*?;$/m, "")
  .replace(/^type Options =[\s\S]*?;$/m, "")
  .replace(/: Launch/g, "")
  .replace(/: Options = \{\}/g, " = {}")
  .replace(/: Promise<unknown>/g, "");
const { launchWithSandboxFallback, SANDBOX_ARGS } = await import(
  `data:text/javascript;base64,${Buffer.from(js).toString("base64")}`
);

/** Records what it was called with; fails for the argument sets in `failFor`. */
function fakeLaunch({ failWithoutArgs = false, failAlways = false } = {}) {
  const calls = [];
  const launch = async (args) => {
    calls.push(args);
    if (failAlways) throw new Error("no browser at all");
    if (failWithoutArgs && args.length === 0) {
      throw new Error("Failed to move to new namespace: ... Operation not permitted");
    }
    return { browser: true, args };
  };
  return { launch, calls };
}

test("on a normal machine it launches with no extra arguments", async () => {
  const { launch, calls } = fakeLaunch();
  const result = await launchWithSandboxFallback(launch);
  assert.deepEqual(calls, [[]]);
  assert.deepEqual(result.args, []);
});

test("inside a sandbox it retries with --no-sandbox and says so", async () => {
  const { launch, calls } = fakeLaunch({ failWithoutArgs: true });
  const warnings = [];
  const result = await launchWithSandboxFallback(launch, {
    warn: (m) => warnings.push(m),
  });
  assert.equal(calls.length, 2, "should try the sandbox first, then fall back");
  assert.deepEqual(calls[0], []);
  assert.deepEqual(calls[1], SANDBOX_ARGS);
  assert.deepEqual(result.args, SANDBOX_ARGS);
  assert.equal(warnings.length, 1, "the weakened launch must be announced");
  assert.match(warnings[0], /--no-sandbox/);
});

test("the retry does not depend on recognising the error text", async () => {
  // The point of the design: an error nobody has ever seen still falls back.
  const calls = [];
  const launch = async (args) => {
    calls.push(args);
    if (args.length === 0) throw new Error("مشكلة غريبة");
    return { ok: true };
  };
  await launchWithSandboxFallback(launch);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1], SANDBOX_ARGS);
});

test("PLAYWRIGHT_NO_SANDBOX=1 goes straight to the fallback", async () => {
  const { launch, calls } = fakeLaunch();
  const warnings = [];
  await launchWithSandboxFallback(launch, {
    forced: "1",
    warn: (m) => warnings.push(m),
  });
  assert.deepEqual(calls, [SANDBOX_ARGS], "must not try the sandbox first");
  assert.equal(warnings.length, 0, "asked for explicitly, so nothing to warn about");
});

test("PLAYWRIGHT_NO_SANDBOX=0 forbids the fallback and surfaces the failure", async () => {
  const { launch, calls } = fakeLaunch({ failWithoutArgs: true });
  await assert.rejects(
    () => launchWithSandboxFallback(launch, { forced: "0" }),
    /new namespace/,
  );
  assert.equal(calls.length, 1, "must not retry");
});

test("when both attempts fail, the FIRST error is the one reported", async () => {
  // The retry failing is a symptom; reporting it would send whoever has to fix
  // this looking at the sandbox when the real problem is a missing browser.
  const calls = [];
  const launch = async (args) => {
    calls.push(args);
    throw new Error(args.length === 0 ? "the real problem" : "the symptom");
  };
  await assert.rejects(() => launchWithSandboxFallback(launch), /the real problem/);
  assert.equal(calls.length, 2);
});
