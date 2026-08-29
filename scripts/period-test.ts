/**
 * Drives the attendance-by-period feature end to end in a real browser.
 *
 *   npx tsx scripts/period-test.ts [base-url]
 *
 * The feature turns on "is this period running right now", so a test that only
 * used the seeded timetable would pass or fail depending on the hour it was
 * run. Instead the test makes itself a live period spanning the current school
 * minute, parks the seeded ones for the duration, and puts everything back
 * afterwards — so it is deterministic at 3am and at 9am alike, and repeatable.
 */
import { chromium, type BrowserContext } from "playwright";
import { PrismaClient } from "@prisma/client";
import { schoolClock, formatHHMM, SCHOOL_TIMEZONE } from "../src/lib/school-time";
import { toDayKey } from "../src/lib/dates";

const BASE = process.argv[2] ?? "http://localhost:3100";
const PASSWORD = process.env.SEED_PASSWORD ?? "Passw0rd!";
const prisma = new PrismaClient();

const results: { name: string; ok: boolean }[] = [];
function check(name: string, ok: boolean, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

/** Signs in and pins the interface to English so selectors stay stable. */
async function signIn(context: BrowserContext, email: string) {
  const page = await context.newPage();
  await context.addCookies([
    {
      name: "eduplus_locale",
      value: "en",
      url: BASE,
    },
  ]);
  await page.goto(`${BASE}/login`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard", { timeout: 20000 });
  return page;
}

async function main() {
  const clock = schoolClock();
  console.log(
    `\nSchool clock: ${clock.dateISO} ${clock.time} (${SCHOOL_TIMEZONE})`,
  );

  // -- Arrange: one period that is live right now --------------------------
  // The seeded periods are parked rather than deleted, because deleting one
  // cascades to every record taken in it.
  const parked = await prisma.period.findMany({ where: { isActive: true } });
  await prisma.period.updateMany({
    where: { isActive: true },
    data: { isActive: false },
  });

  // A generous window on both sides: the register is evaluated by the server a
  // few seconds after this row is written, and a machine whose clock nudges
  // between the two must not turn into a red test.
  const livePeriod = await prisma.period.create({
    data: {
      name: "Test live period",
      startTime: formatHHMM(Math.max(0, clock.minutes - 90)),
      endTime: formatHHMM(Math.min(24 * 60 - 1, clock.minutes + 90)),
    },
  });
  const closedPeriod = await prisma.period.create({
    data: {
      name: "Test closed period",
      // Deliberately a window that cannot contain "now".
      startTime: clock.minutes > 120 ? "00:05" : "23:00",
      endTime: clock.minutes > 120 ? "00:50" : "23:45",
    },
  });

  const browser = await chromium.launch();
  const today = toDayKey(clock.dateISO);

  try {
    // -- 1. The admin sees and manages the school day ----------------------
    console.log("\nAdmin: the school day");
    const adminContext = await browser.newContext();
    const admin = await signIn(adminContext, "admin@eduplus.school");
    await admin.goto(`${BASE}/periods`);
    await admin.waitForLoadState("networkidle");
    await admin.waitForSelector("text=Test live period", { timeout: 20000 });
    check("the admin sees the period list", true);

    const runningNow = await admin.locator("text=Running now").count();
    check("the live period is flagged as running now", runningNow > 0);

    // An overlapping period must be refused, or two could be live at once.
    await admin.click('summary:has-text("Add a period")');
    await admin.fill('input[name="name"]', "Overlapping period");
    await admin.fill('input[name="startTime"]', livePeriod.startTime);
    await admin.fill('input[name="endTime"]', livePeriod.endTime);
    await admin.click('button:has-text("Add period")');
    await admin.waitForSelector("text=/overlaps/i", { timeout: 20000 });
    const overlapCount = await prisma.period.count({
      where: { name: "Overlapping period" },
    });
    check("an overlapping period is refused", overlapCount === 0);

    // -- 2. The teacher marks the live period ------------------------------
    console.log("\nTeacher: mark the class for the period running now");
    const teacherContext = await browser.newContext();
    const teacher = await signIn(teacherContext, "teacher@eduplus.school");

    const teacherUser = await prisma.user.findUniqueOrThrow({
      where: { email: "teacher@eduplus.school" },
    });
    const ownLink = await prisma.classTeacher.findFirstOrThrow({
      where: { userId: teacherUser.id },
      include: { class: true },
    });

    await prisma.periodAttendance.deleteMany({
      where: { periodId: livePeriod.id, date: today },
    });

    await teacher.goto(
      `${BASE}/period-attendance?classId=${ownLink.classId}&periodId=${livePeriod.id}`,
    );
    await teacher.waitForLoadState("networkidle");
    try {
      await teacher.waitForSelector("text=Quick fill:", { timeout: 20000 });
      check("the register is open for the live period", true);
    } catch {
      // A locked register is the failure worth explaining: print the notice the
      // page is showing rather than a bare selector timeout.
      const notice = await teacher
        .locator("main")
        .innerText()
        .then((text) => text.replace(/\s+/g, " ").slice(0, 600))
        .catch(() => null);
      check(
        "the register is open for the live period",
        false,
        notice?.trim() ?? "no lock notice found",
      );
      throw new Error(`register locked: ${notice?.trim() ?? "unknown"}`);
    }

    // The teacher picker must be locked to themselves.
    const teacherSelect = await teacher.locator('select[name="teacherId"]').count();
    check("a teacher cannot browse another teacher's timetable", teacherSelect === 0);

    await teacher.click('button:has-text("All present")');
    await teacher
      .locator("table tbody tr")
      .first()
      .locator('label:has-text("Absent")')
      .click();
    await teacher.click('button:has-text("Save attendance")');
    await teacher.waitForSelector("text=Attendance saved", { timeout: 25000 });

    const saved = await prisma.periodAttendance.findMany({
      where: { periodId: livePeriod.id, classId: ownLink.classId, date: today },
    });
    const absent = saved.filter((r) => r.status === "ABSENT").length;
    check("every student was written", saved.length > 0, `${saved.length} rows`);
    check(
      "mixed statuses persisted",
      absent === 1 && saved.length - absent > 0,
      `${saved.length - absent} present, ${absent} absent`,
    );
    check(
      "the record is attributed to the teacher",
      saved.every((r) => r.recordedById === teacherUser.id),
    );

    // -- 3. A closed period is read-only for the teacher -------------------
    console.log("\nTeacher: a period that is not running");
    await teacher.goto(
      `${BASE}/period-attendance?classId=${ownLink.classId}&periodId=${closedPeriod.id}`,
    );
    await teacher.waitForLoadState("networkidle");
    await teacher.waitForSelector("text=/not running now/i", { timeout: 20000 });
    const teacherSave = await teacher
      .locator('button:has-text("Save attendance")')
      .count();
    check("a closed period has no save control for the teacher", teacherSave === 0);

    // -- 4. An earlier day is closed too -----------------------------------
    const yesterday = new Date(today);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const yesterdayISO = yesterday.toISOString().slice(0, 10);
    await teacher.goto(
      `${BASE}/period-attendance?classId=${ownLink.classId}&periodId=${livePeriod.id}&date=${yesterdayISO}`,
    );
    await teacher.waitForLoadState("networkidle");
    await teacher.waitForSelector("text=/only be written on the day itself/i", {
      timeout: 20000,
    });
    check("a teacher cannot back-date a register", true);

    // -- 5. Admin may correct a closed period ------------------------------
    console.log("\nAdmin: correct a closed period");
    await admin.goto(
      `${BASE}/period-attendance?teacherId=${teacherUser.id}&classId=${ownLink.classId}&periodId=${closedPeriod.id}`,
    );
    await admin.waitForLoadState("networkidle");
    await admin.waitForSelector("text=Quick fill:", { timeout: 20000 });
    await admin.click('button:has-text("All present")');
    await admin.click('button:has-text("Save attendance")');
    await admin.waitForSelector("text=Attendance saved", { timeout: 25000 });

    const corrected = await prisma.periodAttendance.count({
      where: { periodId: closedPeriod.id, date: today },
    });
    check("an admin can correct a closed period", corrected > 0, `${corrected} rows`);

    const correction = await prisma.auditEvent.findFirst({
      where: { entity: "periodAttendance" },
      orderBy: { at: "desc" },
    });
    check(
      "the correction is in the history",
      Boolean(correction && /Corrected/.test(correction.summary)),
      correction?.summary ?? "no audit row",
    );

    // -- 6. The report and its Excel export --------------------------------
    console.log("\nReports: by period, day and class");
    await admin.goto(
      `${BASE}/period-reports?from=${clock.dateISO}&to=${clock.dateISO}`,
    );
    await admin.waitForLoadState("networkidle");
    await admin.waitForSelector("text=By period", { timeout: 20000 });
    const periodNamed = await admin
      .locator(`text=${livePeriod.name}`)
      .count();
    check("today's periods appear in the report", periodNamed > 0);

    const download = await Promise.all([
      admin.waitForEvent("download", { timeout: 30000 }),
      admin.click('a:has-text("Export to Excel")'),
    ]).then(([d]) => d);
    const filename = download.suggestedFilename();
    check(
      "the report exports an .xlsx workbook",
      filename.endsWith(".xlsx"),
      filename,
    );

    // Scope must be enforced on the export, not just the page.
    const parentContext = await browser.newContext();
    const parent = await signIn(parentContext, "parent@eduplus.school");
    // From inside the browser: a production build marks the session cookie
    // Secure, and Playwright's API request context will not send it over
    // plain http://, so the request would land on the login page and this
    // check would pass without ever reaching the export.
    const refused = await parent.evaluate(async (url) => {
      const response = await fetch(url, { credentials: "same-origin" });
      return {
        status: response.status,
        contentType: response.headers.get("content-type") ?? "",
        head: (await response.text()).slice(0, 2),
      };
    }, `${BASE}/period-reports/export?from=${clock.dateISO}&to=${clock.dateISO}`);
    // Assert the harm, not the mechanism: what matters is that no workbook
    // comes back. A production build refuses this by bouncing the request to
    // /login (200, HTML) rather than answering 403, so checking the status
    // alone reported a correctly-blocked export as a failure.
    // Both halves matter: the right status, and definitely no workbook
    // (a real .xlsx is a zip, so it starts "PK").
    check(
      "a parent is refused the period export",
      refused.status === 403 &&
        !refused.contentType.includes("spreadsheet") &&
        refused.head !== "PK",
      `${refused.status} ${refused.contentType}`,
    );

    // -- 7. A teacher's report is limited to their own classes -------------
    await teacher.goto(`${BASE}/period-reports`);
    await teacher.waitForLoadState("networkidle");
    await teacher.waitForSelector("text=By period", { timeout: 20000 });
    const visibleClasses = await prisma.classTeacher.count({
      where: { userId: teacherUser.id },
    });
    const allClasses = await prisma.class.count();
    const chips = await teacher.locator('input[name="classId"]').count();
    check(
      "a teacher only sees their own classes in the report filter",
      chips === visibleClasses && chips < allClasses,
      `${chips} of ${allClasses}`,
    );
  } finally {
    // -- Restore: drop the test periods, wake the seeded ones up -----------
    await prisma.period.deleteMany({
      where: { id: { in: [livePeriod.id, closedPeriod.id] } },
    });
    await prisma.period.deleteMany({ where: { name: "Overlapping period" } });
    await prisma.period.updateMany({
      where: { id: { in: parked.map((p) => p.id) } },
      data: { isActive: true },
    });
    await browser.close();
    await prisma.$disconnect();
  }

  const failed = results.filter((r) => !r.ok).length;
  console.log(
    `\n  ${results.length - failed}/${results.length} checks passed` +
      (failed ? ` — ${failed} FAILED` : ""),
  );
  if (failed) process.exitCode = 1;
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
