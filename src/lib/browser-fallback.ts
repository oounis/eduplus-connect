/**
 * Deciding how to launch a test browser when the sandbox may be unavailable.
 *
 * Split out from `scripts/browser.ts` and kept free of imports so the decision
 * itself can be tested without a browser — the control flow is the part that
 * has to be right, and it is the part that is hardest to reach by hand.
 *
 * ── The problem ─────────────────────────────────────────────────────────────
 *
 * Chromium sandboxes its own renderers, and on Linux that means creating a user
 * namespace. An agent CLI that runs its tools inside a sandbox of its own
 * (Codex uses seccomp + Landlock) blocks that syscall, so Chromium dies at
 * startup:
 *
 *   Failed to move to new namespace: PID namespaces supported,
 *   Network namespace supported, but failed: errno = Operation not permitted
 *
 * A sandbox inside a sandbox. Nothing is wrong with the tests, the install or
 * the machine — the outer sandbox will not let the inner one exist.
 *
 * ── Why this does not look at the error message ─────────────────────────────
 *
 * The obvious version matches that text and retries only on a match. It is also
 * the version that breaks silently: Chromium rewords its startup errors between
 * releases, Codex may wrap them, and a list of strings to match is a list of
 * strings to go stale. When it goes stale the fallback simply never fires and
 * the agent is stuck again with no clue why.
 *
 * So: retry once on ANY failure, and if the retry also fails, throw the FIRST
 * error rather than the second. An unrelated failure — no browser installed,
 * bad executable path — costs one wasted launch attempt and then reports itself
 * accurately. Nothing has to be recognised for this to work.
 */

type Launch = (extraArgs: string[]) => Promise<unknown>;
type Options = { forced?: string; warn?: (message: string) => void };

export const SANDBOX_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  // /dev/shm is often tiny in a container. Without this Chromium crashes part
  // way through a run rather than failing to start, which is far more confusing
  // to diagnose than a clean refusal.
  "--disable-dev-shm-usage",
];

export const SANDBOX_NOTE =
  "  note: Chromium could not start its own sandbox — almost certainly because " +
  "this process is already inside one.\n" +
  "        Retrying with --no-sandbox. Safe here: this browser only ever opens " +
  "our own app on localhost.\n" +
  "        Set PLAYWRIGHT_NO_SANDBOX=0 to forbid the fallback and see the " +
  "original error instead.";

/**
 * `forced` is the value of PLAYWRIGHT_NO_SANDBOX: "1" skips straight to the
 * fallback, "0" forbids it, anything else means "try the sandbox first".
 */
export async function launchWithSandboxFallback(
  launch: Launch,
  options: Options = {},
): Promise<unknown> {
  const forced = options.forced;

  if (forced === "1") return launch(SANDBOX_ARGS);

  try {
    return await launch([]);
  } catch (first) {
    if (forced === "0") throw first;
    try {
      const browser = await launch(SANDBOX_ARGS);
      // Said out loud every time. A run that quietly weakened the browser it
      // tests with should never be something you have to go and find out.
      options.warn?.(SANDBOX_NOTE);
      return browser;
    } catch {
      // The retry failing is a symptom. The first error is the real problem,
      // and it is the one worth putting in front of whoever has to fix it.
      throw first;
    }
  }
}
