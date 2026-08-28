import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const log =
  process.env.NODE_ENV === "development"
    ? (["warn", "error"] as const)
    : (["error"] as const);

/**
 * One PostgreSQL connection, everywhere.
 *
 * Development, staging and production all run the same engine, so a query
 * cannot behave one way on a laptop and another on the server.
 *
 * In production the app talks to pgBouncer rather than to Postgres directly:
 * Next opens a client per server process, and a transaction pooler in front of
 * the database is what keeps a few hundred concurrent requests from turning
 * into a few hundred Postgres backends. `DATABASE_URL` therefore points at the
 * pooler, and `connection_limit` in that URL is what bounds this client.
 */
export const prisma =
  globalForPrisma.prisma ?? new PrismaClient({ log: [...log] });

// Next's dev server re-evaluates modules on every edit; without this the
// process would accumulate a new pool per reload until Postgres refused more.
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
