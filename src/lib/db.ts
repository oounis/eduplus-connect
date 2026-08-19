import { PrismaClient } from "@prisma/client";
import { PrismaLibSQL } from "@prisma/adapter-libsql";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const log =
  process.env.NODE_ENV === "development"
    ? (["warn", "error"] as const)
    : (["error"] as const);

/**
 * Local development runs against the SQLite file in prisma/. When
 * TURSO_DATABASE_URL is set — production on Render — the same schema is served
 * by Turso over libSQL, so nothing else in the app has to know the difference.
 */
function createPrisma(): PrismaClient {
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) return new PrismaClient({ log: [...log] });

  const adapter = new PrismaLibSQL({
    url,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
  return new PrismaClient({ adapter, log: [...log] });
}

export const prisma = globalForPrisma.prisma ?? createPrisma();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
