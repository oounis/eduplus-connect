/**
 * Prepares a real, empty school: the module access defaults and one
 * administrator account. No demo students — a school enters its own.
 * Safe to run more than once; nothing existing is overwritten.
 *
 *   ADMIN_EMAIL=… ADMIN_PASSWORD=… npx tsx scripts/seed-production.ts
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { DEFAULT_ROLE_ACCESS, MODULES, ROLES } from "../src/lib/constants";

// Reads DATABASE_URL like the app does. Point it at the production database
// (via DIRECT_URL, not the pooler) when running this.
const prisma = new PrismaClient();

async function main() {
  const email = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? "";
  if (!email || password.length < 12) {
    throw new Error(
      "Set ADMIN_EMAIL and an ADMIN_PASSWORD of at least 12 characters",
    );
  }

  // ---- module access defaults (only the pairs that are missing) -----------
  const existing = await prisma.roleModuleAccess.findMany({
    select: { role: true, module: true },
  });
  const seen = new Set(existing.map((r) => `${r.role}:${r.module}`));
  let grants = 0;
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
      grants += 1;
    }
  }
  console.log(`access grants added: ${grants}`);

  // ---- the first administrator -------------------------------------------
  const already = await prisma.user.findUnique({ where: { email } });
  if (already) {
    console.log(`administrator ${email} already exists — left untouched`);
  } else {
    await prisma.user.create({
      data: {
        email,
        firstName: process.env.ADMIN_FIRST_NAME ?? "School",
        lastName: process.env.ADMIN_LAST_NAME ?? "Administrator",
        role: "ADMIN",
        passwordHash: await bcrypt.hash(password, 10),
      },
    });
    console.log(`administrator created: ${email}`);
  }

  // ---- an academic year, so classes have somewhere to hang ----------------
  const year = await prisma.academicYear.findFirst();
  if (!year) {
    const now = new Date();
    const startYear = now.getUTCMonth() >= 7 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
    const created = await prisma.academicYear.create({
      data: {
        name: `${startYear}-${startYear + 1}`,
        startDate: new Date(Date.UTC(startYear, 8, 1)),
        endDate: new Date(Date.UTC(startYear + 1, 5, 30)),
        isCurrent: true,
      },
    });
    console.log(`academic year created: ${created.name}`);
  } else {
    console.log(`academic year ${year.name} already exists`);
  }

  // ---- the school day -----------------------------------------------------
  // Without periods the attendance-by-period page has nothing to open on, so a
  // fresh school gets a conventional timetable it can then edit under
  // /periods rather than an empty screen.
  if ((await prisma.period.count()) === 0) {
    const plan = [
      ["Period 1", "08:00", "08:45"],
      ["Period 2", "08:50", "09:35"],
      ["Period 3", "09:40", "10:25"],
      ["Period 4", "10:45", "11:30"],
      ["Period 5", "11:35", "12:20"],
      ["Period 6", "13:00", "13:45"],
      ["Period 7", "13:50", "14:35"],
    ] as const;
    for (const [name, startTime, endTime] of plan) {
      await prisma.period.create({ data: { name, startTime, endTime } });
    }
    console.log(`school day created: ${plan.length} periods (edit under /periods)`);
  } else {
    console.log("school day already defined — left untouched");
  }

  const counts = {
    users: await prisma.user.count(),
    students: await prisma.student.count(),
    classes: await prisma.class.count(),
    periods: await prisma.period.count(),
  };
  console.log("current totals:", JSON.stringify(counts));
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error.message ?? error);
    await prisma.$disconnect();
    process.exit(1);
  });
