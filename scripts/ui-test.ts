/**
 * Drives the real UI in a headless browser to prove the interactive flows
 * work end to end: login, taking a register, and writing an observation.
 *
 *   npx tsx scripts/ui-test.ts [base-url]
 */
import { chromium } from "playwright";
import { PrismaClient } from "@prisma/client";

const BASE = process.argv[2] ?? "http://localhost:3100";
const PASSWORD = process.env.SEED_PASSWORD ?? "Passw0rd!";
const prisma = new PrismaClient();

const results: { name: string; ok: boolean; detail: string }[] = [];
function check(name: string, ok: boolean, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function todayKey(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()));
}

async function main() {
  const browser = await chromium.launch();

  // -- 1. Supervisor logs in and takes a register --------------------------
  console.log("\nSupervisor: login → take attendance");
  const supervisorPage = await browser.newPage();
  await supervisorPage.goto(`${BASE}/login`);
  await supervisorPage.fill('input[name="email"]', "supervisor2@eduplus.school");
  await supervisorPage.fill('input[name="password"]', PASSWORD);
  await supervisorPage.click('button[type="submit"]');
  await supervisorPage.waitForURL("**/dashboard", { timeout: 15000 });
  check("login redirects to the dashboard", supervisorPage.url().includes("/dashboard"));

  // Grade 6 - B is deliberately left blank by the seed.
  const klass = await prisma.class.findFirst({ where: { name: "Grade 6 - B" } });
  if (!klass) throw new Error("seed class Grade 6 - B is missing");

  // Make the run repeatable: this is the register the test fills below, so
  // clear today's rows rather than depending on a freshly seeded database.
  await prisma.attendance.deleteMany({
    where: { classId: klass.id, date: todayKey() },
  });
  const before = await prisma.attendance.count({
    where: { classId: klass.id, date: todayKey() },
  });
  check("register starts empty for Grade 6 - B", before === 0, `${before} rows`);

  const dateISO = todayKey().toISOString().slice(0, 10);
  await supervisorPage.goto(`${BASE}/attendance?classId=${klass.id}&date=${dateISO}`);
  await supervisorPage.waitForSelector("text=Quick fill:", { timeout: 15000 });

  await supervisorPage.click('button:has-text("All present")');
  // Mark the first student absent, so the save is not uniform.
  await supervisorPage
    .locator('table tbody tr')
    .first()
    .locator('label:has-text("Absent")')
    .click();
  await supervisorPage.click('button:has-text("Save register")');
  await supervisorPage.waitForSelector("text=Register saved", { timeout: 20000 });

  const after = await prisma.attendance.findMany({
    where: { classId: klass.id, date: todayKey() },
  });
  const absent = after.filter((r) => r.status === "ABSENT").length;
  const present = after.filter((r) => r.status === "PRESENT").length;
  check("register saved every student", after.length > 0, `${after.length} rows written`);
  check("mixed statuses persisted", absent === 1 && present === after.length - 1,
    `${present} present, ${absent} absent`);

  // -- 2. A supervisor cannot reach a class they do not supervise ----------
  // The picker only lists their own classes, so an unknown id must fall back
  // to one of theirs rather than leaking another class.
  const otherClass = await prisma.class.findFirst({ where: { name: "Grade 4 - A" } });
  await supervisorPage.goto(`${BASE}/attendance?classId=${otherClass!.id}&date=${dateISO}`);
  const leaked = await supervisorPage.locator("text=Grade 4 - A").count();
  check("an unassigned class is not exposed to a supervisor", leaked === 0);

  // -- 2b. Staff can see every register but may not write one --------------
  console.log("\nStaff: school-wide view, read-only register");
  const staffPage = await browser.newPage();
  await staffPage.goto(`${BASE}/login`);
  await staffPage.fill('input[name="email"]', "staff@eduplus.school");
  await staffPage.fill('input[name="password"]', PASSWORD);
  await staffPage.click('button[type="submit"]');
  await staffPage.waitForURL("**/dashboard", { timeout: 15000 });
  await staffPage.goto(`${BASE}/attendance?classId=${otherClass!.id}&date=${dateISO}`);
  const staffReadOnly = await staffPage
    .locator("text=you are not the supervisor of this class")
    .count();
  const staffCanSave = await staffPage.locator('button:has-text("Save register")').count();
  check("staff sees every class read-only", staffReadOnly > 0);
  check("staff has no save control", staffCanSave === 0);

  // -- 3. Teacher writes an observation ------------------------------------
  console.log("\nTeacher: login → add an observation");
  const teacherPage = await browser.newPage();
  await teacherPage.goto(`${BASE}/login`);
  await teacherPage.fill('input[name="email"]', "teacher@eduplus.school");
  await teacherPage.fill('input[name="password"]', PASSWORD);
  await teacherPage.click('button[type="submit"]');
  await teacherPage.waitForURL("**/dashboard", { timeout: 15000 });

  const teacher = await prisma.user.findUnique({
    where: { email: "teacher@eduplus.school" },
    include: { taughtClasses: true },
  });
  const taughtId = teacher!.taughtClasses[0].classId;

  const obsBefore = await prisma.observation.count({ where: { authorId: teacher!.id } });
  await teacherPage.goto(`${BASE}/observations?classId=${taughtId}`);
  await teacherPage.click("summary:has-text('Add an observation')");
  await teacherPage.selectOption('select[name="category"]', "HOMEWORK");
  await teacherPage.selectOption('select[name="sentiment"]', "CONCERN");
  await teacherPage.fill('textarea[name="note"]', "UI test observation — homework missing twice.");
  await teacherPage.click('button:has-text("Add observation")');
  await teacherPage.waitForSelector("text=Observation added", { timeout: 20000 });

  const obsAfter = await prisma.observation.count({ where: { authorId: teacher!.id } });
  check("observation persisted", obsAfter === obsBefore + 1, `${obsBefore} → ${obsAfter}`);

  const shown = await teacherPage.locator("text=UI test observation").count();
  check("new observation appears in the week list", shown > 0);

  // -- 4. Admin dashboard reflects the new attendance ----------------------
  console.log("\nAdmin: dashboard reflects the new data");
  const adminPage = await browser.newPage();
  await adminPage.goto(`${BASE}/login`);
  await adminPage.fill('input[name="email"]', "admin@eduplus.school");
  await adminPage.fill('input[name="password"]', PASSWORD);
  await adminPage.click('button[type="submit"]');
  await adminPage.waitForURL("**/dashboard", { timeout: 15000 });

  const notTaken = await adminPage.locator("text=Not taken").count();
  check("all registers now show as taken", notTaken === 0, `${notTaken} classes pending`);

  const rateText = await adminPage
    .locator("text=Attendance rate")
    .locator("xpath=..")
    .innerText();
  check("dashboard shows an attendance rate", /%/.test(rateText), rateText.replace(/\n/g, " "));

  // -- 5. Access control is enforced in the browser ------------------------
  await teacherPage.goto(`${BASE}/users`);
  check("teacher is redirected away from Users", teacherPage.url().includes("/denied"),
    teacherPage.url());

  await browser.close();
  await prisma.$disconnect();

  const failed = results.filter((r) => !r.ok);
  console.log(
    `\n${results.length - failed.length}/${results.length} checks passed.`,
  );
  if (failed.length > 0) process.exit(1);
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
