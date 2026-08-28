/**
 * Drives the real UI in a headless browser to prove the interactive flows
 * work end to end: login, taking a register, and writing an observation.
 *
 *   npx tsx scripts/ui-test.ts [base-url]
 */
import { chromium, type Page } from "playwright";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

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

/**
 * A page pinned to English.
 *
 * The interface defaults to Arabic, and the checks below match on English
 * labels — without pinning, every text selector here would go looking for a
 * string the page no longer renders.
 */
async function newPage(browser: Awaited<ReturnType<typeof chromium.launch>>) {
  const page = await browser.newPage();
  await page.context().addCookies([
    { name: "eduplus_locale", value: "en", url: BASE },
  ]);
  return page;
}

/**
 * True when the app refused the page.
 *
 * How a refusal arrives depends on the build. A production server answers
 * `redirect("/denied")` with a 307 and `notFound()` with a 404; the dev server
 * has already begun streaming by the time either is thrown, so it answers 200
 * and puts the refusal in the body — a `<meta http-equiv="refresh">` to
 * /denied, or the not-found page. Asserting on the status alone therefore
 * reads "granted" for a page that was correctly blocked, which is the one
 * failure this check must never miss.
 */
async function refused(
  page: Page,
  response: { status(): number } | null,
): Promise<boolean> {
  const status = response?.status() ?? 0;
  if (status === 403 || status === 404) return true;

  await page.waitForURL("**/denied", { timeout: 3000 }).catch(() => {});
  if (page.url().includes("/denied")) return true;

  const body = await page.content();
  return /data-page="denied"|url=\/denied|could not be found/.test(body);
}

async function main() {
  const browser = await chromium.launch();

  // -- 1. Supervisor logs in and takes a register --------------------------
  console.log("\nSupervisor: login → take attendance");
  const supervisorPage = await newPage(browser);
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
  const staffPage = await newPage(browser);
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
  const teacherPage = await newPage(browser);
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
  const adminPage = await newPage(browser);
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
  const usersResponse = await teacherPage.goto(`${BASE}/users`);
  check("teacher is redirected away from Users",
    await refused(teacherPage, usersResponse), teacherPage.url());

  // -- 6. Student profile: only the right people may open it ---------------
  console.log("\nStudent profile: visibility");
  const child = await prisma.student.findFirst({
    where: { parent: { email: "parent@eduplus.school" } },
  });
  const stranger = await prisma.student.findFirst({
    where: { parentId: { not: child!.parentId }, classId: { not: null } },
  });

  const parentPage = await newPage(browser);
  await parentPage.goto(`${BASE}/login`);
  await parentPage.fill('input[name="email"]', "parent@eduplus.school");
  await parentPage.fill('input[name="password"]', PASSWORD);
  await parentPage.click('button[type="submit"]');
  await parentPage.waitForURL("**/dashboard", { timeout: 15000 });

  await parentPage.goto(`${BASE}/students/${child!.id}`);
  const seesOwnChild = await parentPage
    .locator(`text=${child!.lastName}`)
    .first()
    .count();
  check("a parent can open their own child's profile", seesOwnChild > 0);

  const strangerResponse = await parentPage.goto(`${BASE}/students/${stranger!.id}`);
  check("a parent cannot open another family's child",
    await refused(parentPage, strangerResponse),
    `HTTP ${strangerResponse?.status()}`);

  // A teacher reaches the students of their own classes, and no others.
  const inClass = await prisma.student.findFirst({ where: { classId: taughtId } });
  const outOfClass = await prisma.student.findFirst({
    where: { classId: { notIn: teacher!.taughtClasses.map((c) => c.classId) } },
  });
  const inResponse = await teacherPage.goto(`${BASE}/students/${inClass!.id}`);
  check("a teacher opens a student of their own class", inResponse?.status() === 200);
  const outResponse = await teacherPage.goto(`${BASE}/students/${outOfClass!.id}`);
  check("a teacher cannot open a student outside their classes",
    await refused(teacherPage, outResponse), `HTTP ${outResponse?.status()}`);

  const historyRows = await teacherPage.goto(`${BASE}/students/${inClass!.id}?days=90`);
  check("the profile accepts a longer period", historyRows?.status() === 200);

  // -- 7. Reports and CSV export -------------------------------------------
  console.log("\nReports: totals and CSV export");
  await adminPage.goto(`${BASE}/reports`);
  await adminPage.waitForSelector("text=Students by absence", { timeout: 20000 });
  const classRowCount = await adminPage
    .locator("table")
    .first()
    .locator("tbody tr")
    .count();
  check("the report lists every class", classRowCount === 6, `${classRowCount} rows`);

  const csv = await adminPage.request.get(`${BASE}/reports/export?type=students`);
  const csvBody = await csv.text();
  const csvLines = csvBody.trim().split("\r\n");
  check("student CSV downloads", csv.status() === 200 &&
    csv.headers()["content-type"].startsWith("text/csv"), csv.headers()["content-type"]);
  const reportable = await prisma.student.count({
    where: { isActive: true, class: { isNot: null } },
  });
  check("student CSV has a row per student", csvLines.length === reportable + 1,
    `${csvLines.length} lines for ${reportable} students`);

  const obsCsv = await adminPage.request.get(`${BASE}/reports/export?type=observations`);
  check("observation CSV downloads", obsCsv.status() === 200);

  const parentCsv = await parentPage.request.get(`${BASE}/reports/export?type=students`);
  check("a parent is refused the export", parentCsv.status() === 403,
    `HTTP ${parentCsv.status()}`);

  // A supervisor's export must contain only their own classes.
  const supCsv = await supervisorPage.request.get(`${BASE}/reports/export?type=classes`);
  const supLines = (await supCsv.text()).trim().split("\r\n");
  check("a supervisor exports only their own classes", supLines.length === 4,
    `${supLines.length - 1} classes`);

  // -- 8. A user can change their own password ------------------------------
  console.log("\nAccount: change my own password");
  const NEW_PASSWORD = "ChangedPass1!";
  await staffPage.goto(`${BASE}/profile`);
  await staffPage.fill('input[name="currentPassword"]', PASSWORD);
  await staffPage.fill('input[name="newPassword"]', NEW_PASSWORD);
  await staffPage.fill('input[name="confirmPassword"]', "somethingElse1!");
  await staffPage.click('button:has-text("Change password")');
  await staffPage.waitForSelector("text=do not match", { timeout: 15000 });
  check("a mismatched confirmation is rejected", true);

  await staffPage.fill('input[name="currentPassword"]', PASSWORD);
  await staffPage.fill('input[name="newPassword"]', NEW_PASSWORD);
  await staffPage.fill('input[name="confirmPassword"]', NEW_PASSWORD);
  await staffPage.click('button:has-text("Change password")');
  await staffPage.waitForSelector("text=Your password was changed", { timeout: 15000 });

  const relogin = await newPage(browser);
  await relogin.goto(`${BASE}/login`);
  await relogin.fill('input[name="email"]', "staff@eduplus.school");
  await relogin.fill('input[name="password"]', NEW_PASSWORD);
  await relogin.click('button[type="submit"]');
  await relogin.waitForURL("**/dashboard", { timeout: 15000 });
  check("the new password signs in", relogin.url().includes("/dashboard"));

  // Put the seed password back so the suite can run again.
  await relogin.goto(`${BASE}/profile`);
  await relogin.fill('input[name="currentPassword"]', NEW_PASSWORD);
  await relogin.fill('input[name="newPassword"]', PASSWORD);
  await relogin.fill('input[name="confirmPassword"]', PASSWORD);
  await relogin.click('button:has-text("Change password")');
  await relogin.waitForSelector("text=Your password was changed", { timeout: 15000 });
  const restored = await prisma.user.findUnique({
    where: { email: "staff@eduplus.school" },
  });
  check("the seed password is restored",
    await bcrypt.compare(PASSWORD, restored!.passwordHash));

  // -- 9. Bulk import: preview, then write ---------------------------------
  console.log("\nStudents: CSV import");
  const targetClass = await prisma.class.findFirst({ where: { name: "Grade 4 - A" } });
  const stamp = String(await prisma.student.count());
  const goodCode = `IMP-${stamp}-1`;
  const importCsv = [
    "firstName,lastName,code,dateOfBirth,class,parentEmail",
    `Yasmin,Haddad,${goodCode},2015-04-23,${targetClass!.name},parent@eduplus.school`,
    `Omar,Belhaj,,12/09/2014,${targetClass!.name},`,
    ",Missing,IMP-BAD-1,,,",                        // no first name
    `Dup,Licate,${goodCode},,,`,                     // code repeated in the file
    "Nour,Trabelsi,,,Grade 99 - Z,",                 // class does not exist
    "Sami,Kefi,,,,ghost@nowhere.test",               // parent does not exist
  ].join("\n");

  const beforeImport = await prisma.student.count();
  await adminPage.goto(`${BASE}/students`);
  await adminPage.click("summary:has-text('Import students from a CSV file')");
  await adminPage.fill('textarea[name="csv"]', importCsv);
  await adminPage.click('button:has-text("Check the file")');
  await adminPage.waitForSelector("text=will be skipped", { timeout: 20000 });

  const readyBadges = await adminPage.locator('td .badge:has-text("ready")').count();
  check("the preview accepts the two good rows", readyBadges === 2, `${readyBadges} ready`);
  const stillSame = await prisma.student.count();
  check("the preview writes nothing", stillSame === beforeImport,
    `${beforeImport} → ${stillSame}`);
  const reasons = await adminPage.locator("td .badge").allInnerTexts();
  check("each bad row says why it was rejected",
    reasons.some((r) => r.includes("first and last name")) &&
    reasons.some((r) => r.includes("repeated")) &&
    reasons.some((r) => r.includes("no class")) &&
    reasons.some((r) => r.includes("no parent account")),
    reasons.filter((r) => r !== "ready").join(" | "));

  await adminPage.click('button:has-text("Import 2 students")');
  await adminPage.waitForSelector("text=Imported 2 students", { timeout: 20000 });
  const afterImport = await prisma.student.count();
  check("only the good rows were written", afterImport === beforeImport + 2,
    `${beforeImport} → ${afterImport}`);

  const imported = await prisma.student.findUnique({
    where: { code: goodCode },
    include: { class: true, parent: true },
  });
  check("the imported student got their class and parent",
    imported?.class?.name === targetClass!.name &&
    imported?.parent?.email === "parent@eduplus.school",
    `${imported?.class?.name} · ${imported?.parent?.email}`);
  const omar = await prisma.student.findFirst({
    where: { lastName: "Belhaj", firstName: "Omar" },
    orderBy: { createdAt: "desc" },
  });
  check("a DD/MM/YYYY date was understood",
    omar?.dateOfBirth?.toISOString().slice(0, 10) === "2014-09-12",
    omar?.dateOfBirth?.toISOString().slice(0, 10) ?? "none");

  // Take the two imported students back out so the suite can be re-run.
  await prisma.student.deleteMany({
    where: { id: { in: [imported!.id, omar!.id] } },
  });
  check("the imported rows were cleaned up",
    (await prisma.student.count()) === beforeImport);

  // -- 10. The history records what just happened ---------------------------
  console.log("\nHistory: the audit trail");
  await adminPage.goto(`${BASE}/audit`);
  await adminPage.waitForSelector("text=Events recorded", { timeout: 20000 });
  const importLine = await adminPage.locator("text=Imported 2 students from CSV").count();
  check("the import is in the history", importLine > 0);
  const registerLine = await adminPage
    .locator("text=Saved the register for Grade 6 - B").count();
  check("the register save is in the history", registerLine > 0);

  await adminPage.goto(`${BASE}/audit?entity=student`);
  const entities = await adminPage.locator("tbody tr td:nth-child(4)").allInnerTexts();
  check("filtering by entity works",
    entities.length > 0 && entities.every((e) => e.trim() === "student"),
    `${entities.length} rows, all "student"`);

  const teacherAudit = await teacherPage.goto(`${BASE}/audit`);
  check("only an administrator sees the history",
    await refused(teacherPage, teacherAudit), teacherPage.url());

  // -- 11. Terms drive the report period ------------------------------------
  console.log("\nReports: term periods");
  const term = await prisma.term.findFirst({ orderBy: { startDate: "asc" } });
  await adminPage.goto(`${BASE}/reports`);
  await adminPage.waitForSelector("text=Quick period", { timeout: 20000 });
  const termChip = adminPage.locator(`a.badge:has-text("${term!.name}")`).first();
  check("each term is offered as a period", (await termChip.count()) > 0, term!.name);
  await Promise.all([
    adminPage.waitForURL(`**/reports?from=${term!.startDate.toISOString().slice(0, 10)}*`,
      { timeout: 20000 }),
    termChip.click(),
  ]);
  await adminPage.waitForSelector("text=Students by absence", { timeout: 20000 });
  const heading = await adminPage
    .locator('h1:has-text("Reports")')
    .locator("xpath=following-sibling::p")
    .innerText();
  const expected = term!.startDate.toLocaleDateString("en-GB",
    { weekday: "short", day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
  check("choosing a term sets the report range", heading.includes(expected),
    heading.replace(/\n/g, " "));

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
