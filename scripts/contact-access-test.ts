/**
 * Proves the supervisor contact-edit rule, against the real database.
 *
 *   npx tsx scripts/contact-access-test.ts
 *
 * The rule: a SUPERVISOR may edit email / phone / phone2 / phone3 for students
 * in the classes assigned to them, and for nobody else. Admin keeps full
 * access. Teachers and parents get nothing.
 *
 * This exists because the check is the only thing standing between "supervisor
 * updates a phone number" and "supervisor edits any student in the school", and
 * a boolean in a permissions table is easy to get wrong by accident later.
 */
import { PrismaClient } from "@prisma/client";
import { MODULES, DEFAULT_ROLE_ACCESS } from "../src/lib/constants";
import type { ModuleKey, Role } from "../src/lib/constants";

const prisma = new PrismaClient();

type Case = { name: string; pass: boolean; detail: string };
const results: Case[] = [];
function check(name: string, pass: boolean, detail = "") {
  results.push({ name, pass, detail });
}

/** Mirrors lib/auth's access resolution closely enough for this test. */
function accessFor(role: string) {
  const defaults = (DEFAULT_ROLE_ACCESS as Record<string, unknown>)[role] ?? {};
  const map = Object.fromEntries(
    MODULES.map((m) => [m, { view: false, edit: false }]),
  ) as Record<ModuleKey, { view: boolean; edit: boolean }>;
  for (const [key, value] of Object.entries(defaults as Record<string, unknown>)) {
    map[key as ModuleKey] = value as { view: boolean; edit: boolean };
  }
  return map;
}

async function main() {
  // Import the real implementation, not a copy of it.
  const { canEditStudentContact } = await import("../src/lib/student-contact");

  const supervisorLink = await prisma.classSupervisor.findFirst({
    include: { user: true, class: true },
  });
  if (!supervisorLink) throw new Error("No supervisor assignment in the database");
  const supervisor = {
    userId: supervisorLink.userId,
    role: supervisorLink.user.role as Role,
    access: accessFor(supervisorLink.user.role),
  };

  const myClassIds = (
    await prisma.classSupervisor.findMany({
      where: { userId: supervisor.userId },
      select: { classId: true },
    })
  ).map((r) => r.classId);

  // 1. a student inside their classes -> allowed
  const mine = await prisma.student.findFirst({
    where: { classId: { in: myClassIds } },
  });
  if (!mine) throw new Error("No student in the supervisor's classes");
  const a = await canEditStudentContact(supervisor, mine.id);
  check(
    "supervisor CAN edit a student in their own class",
    a.allowed && a.reason === "supervisor",
    `${mine.code} in ${supervisorLink.class.name} -> ${JSON.stringify(a)}`,
  );

  // 2. a student in someone else's class -> denied
  const theirs = await prisma.student.findFirst({
    where: { classId: { notIn: myClassIds }, NOT: { classId: null } },
  });
  if (!theirs) throw new Error("No student outside the supervisor's classes");
  const b = await canEditStudentContact(supervisor, theirs.id);
  check(
    "supervisor CANNOT edit a student in another class",
    !b.allowed && b.reason === "not-my-class",
    `${theirs.code} -> ${JSON.stringify(b)}`,
  );

  // 3. a student with no class at all -> denied
  const unassigned = await prisma.student.create({
    data: { code: `TEST-${Date.now()}`, firstName: "No", lastName: "Class" },
  });
  const c = await canEditStudentContact(supervisor, unassigned.id);
  check(
    "supervisor CANNOT edit an unassigned student",
    !c.allowed && c.reason === "not-my-class",
    JSON.stringify(c),
  );

  // 4. a student that does not exist -> denied, not a crash
  const d = await canEditStudentContact(supervisor, "does-not-exist");
  check(
    "a missing student is denied, not an error",
    !d.allowed && d.reason === "no-student",
    JSON.stringify(d),
  );

  // 5. admin -> allowed everywhere, via the module right
  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  if (admin) {
    const e = await canEditStudentContact(
      { userId: admin.id, role: "ADMIN" as Role, access: accessFor("ADMIN") },
      theirs.id,
    );
    check(
      "admin CAN edit any student",
      e.allowed && e.reason === "module",
      JSON.stringify(e),
    );
  }

  // 6. teacher -> denied, even for a class they teach
  const teacherLink = await prisma.classTeacher.findFirst({ include: { user: true } });
  if (teacherLink) {
    const theirStudent = await prisma.student.findFirst({
      where: { classId: teacherLink.classId },
    });
    if (theirStudent) {
      const f = await canEditStudentContact(
        {
          userId: teacherLink.userId,
          role: teacherLink.user.role as Role,
          access: accessFor(teacherLink.user.role),
        },
        theirStudent.id,
      );
      check(
        "teacher CANNOT edit contact details",
        !f.allowed,
        JSON.stringify(f),
      );
    }
  }

  // 7. parent -> denied for their own child
  const child = await prisma.student.findFirst({
    where: { NOT: { parentId: null } },
    include: { parent: true },
  });
  if (child?.parent) {
    const g = await canEditStudentContact(
      {
        userId: child.parent.id,
        role: child.parent.role as Role,
        access: accessFor(child.parent.role),
      },
      child.id,
    );
    check("parent CANNOT edit contact details", !g.allowed, JSON.stringify(g));
  }

  await prisma.student.delete({ where: { id: unassigned.id } });

  const failed = results.filter((r) => !r.pass);
  for (const r of results) {
    console.log(`${r.pass ? "  PASS" : "  FAIL"}  ${r.name}`);
    if (!r.pass) console.log(`        ${r.detail}`);
  }
  console.log(
    `\n  ${results.length - failed.length}/${results.length} passed`,
  );
  if (failed.length) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
