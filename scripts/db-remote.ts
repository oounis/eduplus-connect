/**
 * Applies a .sql file to the Turso database, statement by statement.
 * Prisma cannot push a schema over libSQL, so the DDL produced by
 *   npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script
 * is applied with this instead.
 *
 *   npx tsx scripts/db-remote.ts schema.sql
 *   npx tsx scripts/db-remote.ts --tables      # list what is there now
 */
import { readFileSync } from "node:fs";
import { createClient } from "@libsql/client";

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
if (!url) throw new Error("TURSO_DATABASE_URL is not set");

const db = createClient({ url, authToken });

async function main() {
  const arg = process.argv[2];

  if (!arg || arg === "--tables") {
    const rows = await db.execute(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    );
    for (const row of rows.rows) {
      const table = String(row.name);
      const count = await db.execute(`SELECT COUNT(*) AS n FROM "${table}"`);
      console.log(`  ${table.padEnd(20)} ${count.rows[0].n} rows`);
    }
    return;
  }

  const sql = readFileSync(arg, "utf8");
  // Drop the "-- CreateTable" comments first, then split on the statement
  // terminator. The generated DDL contains no procedure bodies, so a plain
  // split on ";" is safe here.
  const statements = sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);

  console.log(`Applying ${statements.length} statements from ${arg}`);
  for (const statement of statements) {
    await db.execute(statement);
  }
  console.log("Done.");
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
