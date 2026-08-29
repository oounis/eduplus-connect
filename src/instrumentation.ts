/**
 * Startup configuration check.
 *
 * Next calls `register()` once, when the server process starts, before it
 * serves anything. That is the right moment to refuse a misconfigured
 * production deployment.
 *
 * The alternative — validating lazily, the first time a value is used — means a
 * server that boots, passes its health check, joins the load balancer, and only
 * reveals the problem when a real person tries to sign in. Worse, a weak
 * AUTH_SECRET would not fail at all: it would quietly work, and every session
 * it issued would be forgeable by anyone who has read this repository.
 *
 * A server that will not start is a cheap, loud failure. That is the one we
 * want.
 */

/** The placeholder shipped in .env.example. Fine locally, fatal in production. */
const DEV_SECRET = "dev-secret-change-me-in-production-min-32-chars";

export async function register() {
  // Next runs this in the edge runtime too, where none of this applies.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const problems: string[] = [];
  const isProduction = process.env.NODE_ENV === "production";

  // --- Database ------------------------------------------------------------
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    problems.push("DATABASE_URL is not set.");
  } else if (!/^postgres(ql)?:\/\//.test(databaseUrl)) {
    problems.push(
      "DATABASE_URL must be a postgresql:// URL — this app no longer runs on SQLite.",
    );
  } else if (isProduction && !databaseUrl.includes("pgbouncer=true")) {
    // Not fatal: a deployment without a pooler is a valid choice. But the
    // failure it causes ("prepared statement s0 already exists") is
    // intermittent and appears only under load, so it is worth naming now.
    console.warn(
      "[startup] DATABASE_URL has no pgbouncer=true. If this points at " +
        "pgBouncer in transaction mode, expect intermittent " +
        '"prepared statement already exists" errors under load.',
    );
  }

  // --- Session signing key -------------------------------------------------
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    problems.push("AUTH_SECRET is not set.");
  } else if (isProduction) {
    if (secret === DEV_SECRET) {
      problems.push(
        "AUTH_SECRET is still the example value from .env.example. " +
          "Anyone who has read the repository could mint an administrator " +
          "session. Generate one: openssl rand -base64 48",
      );
    } else if (secret.length < 32) {
      problems.push(
        `AUTH_SECRET is ${secret.length} characters; production requires at ` +
          "least 32. Generate one: openssl rand -base64 48",
      );
    }
  } else if (secret.length < 16) {
    problems.push("AUTH_SECRET must be at least 16 characters.");
  }

  // --- School timezone -----------------------------------------------------
  // The whole period feature reads from this. A typo here does not throw
  // anywhere obvious — it silently falls back and unlocks the wrong period.
  const timezone = process.env.SCHOOL_TIMEZONE;
  if (timezone) {
    try {
      new Intl.DateTimeFormat("en-CA", { timeZone: timezone });
    } catch {
      problems.push(
        `SCHOOL_TIMEZONE "${timezone}" is not a valid IANA timezone ` +
          '(expected something like "Asia/Bahrain").',
      );
    }
  }

  if (problems.length > 0) {
    const message = [
      "",
      "  EduPlus Connect cannot start — configuration is invalid:",
      "",
      ...problems.map((p) => `    • ${p}`),
      "",
      "  See .env.example.",
      "",
    ].join("\n");

    console.error(message);
    // Exiting rather than throwing: a thrown error here can be swallowed and
    // leave the process running and serving.
    process.exit(1);
  }

  console.log(
    `[startup] EduPlus Connect ready — ${process.env.NODE_ENV ?? "development"}` +
      `, school timezone ${timezone ?? "Asia/Bahrain (default)"}`,
  );
}
