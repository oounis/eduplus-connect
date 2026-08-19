/**
 * Adds the default grants for any (role, module) pair that has no row yet —
 * run it after a new module is added to `MODULES`, so an existing database
 * picks the module up without a reseed. Existing rows are never touched, so
 * whatever the administrator changed in /access is preserved.
 *
 *   npx tsx scripts/sync-access.ts
 */
import { PrismaClient } from "@prisma/client";
import { DEFAULT_ROLE_ACCESS, MODULES, ROLES } from "../src/lib/constants";

const prisma = new PrismaClient();

async function main() {
  const existing = await prisma.roleModuleAccess.findMany({
    select: { role: true, module: true },
  });
  const seen = new Set(existing.map((r) => `${r.role}:${r.module}`));

  let added = 0;
  for (const role of ROLES) {
    for (const moduleKey of MODULES) {
      if (seen.has(`${role}:${moduleKey}`)) continue;
      const grant = DEFAULT_ROLE_ACCESS[role][moduleKey];
      await prisma.roleModuleAccess.create({
        data: {
          role,
          module: moduleKey,
          canView: grant?.view ?? false,
          canEdit: grant?.edit ?? false,
        },
      });
      added += 1;
      console.log(`  + ${role} → ${moduleKey}` +
        ` (${grant?.edit ? "edit" : grant?.view ? "view" : "no access"})`);
    }
  }

  // Rows for modules that no longer exist would only confuse /access.
  const stale = existing.filter(
    (r) => !MODULES.includes(r.module as (typeof MODULES)[number]),
  );
  if (stale.length > 0) {
    await prisma.roleModuleAccess.deleteMany({
      where: { module: { in: [...new Set(stale.map((r) => r.module))] } },
    });
    console.log(`  - removed ${stale.length} grants for retired modules`);
  }

  console.log(added === 0 ? "Access is already in sync." : `Added ${added} grants.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
