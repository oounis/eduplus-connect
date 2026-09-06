import { chromium, type Browser, type LaunchOptions } from "playwright";
import { launchWithSandboxFallback } from "../src/lib/browser-fallback";

/**
 * The one place every suite launches Chromium from.
 *
 * Thin on purpose: the decision — try the sandbox, fall back once, report the
 * first error if both fail — lives in `src/lib/browser-fallback.ts`, where it
 * is tested without a browser (`npm run test`). Everything left here is the
 * Playwright call it wraps.
 *
 * ── The honest caveat ───────────────────────────────────────────────────────
 *
 * `--no-sandbox` turns off Chromium's renderer isolation. That is a real
 * reduction, and it is the standard CI configuration for a reason: this browser
 * only ever drives our own application on localhost, never the open web. Do not
 * copy the flag into anything that opens pages you did not write.
 */
export async function launchBrowser(
  options: LaunchOptions = {},
): Promise<Browser> {
  const browser = await launchWithSandboxFallback(
    (extraArgs) =>
      chromium.launch({ ...options, args: [...(options.args ?? []), ...extraArgs] }),
    {
      forced: process.env.PLAYWRIGHT_NO_SANDBOX,
      warn: (message) => console.error(message),
    },
  );
  // The helper is deliberately untyped in its return so it can be tested with a
  // fake launcher; this is the single place that knows what it really produces.
  return browser as Browser;
}
