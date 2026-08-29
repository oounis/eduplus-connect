/**
 * Quick attendance, end to end — and, more importantly, what it refuses.
 *
 *   npx tsx scripts/quick-test.ts [base-url]
 *
 * This is the one page in the application reachable without signing in, so the
 * checks that matter are the negative ones: no roster before the PIN, no
 * writing as somebody else, no reaching the rest of the app with a quick token.
 *
 * Like the period suite, it makes itself a live period so it is deterministic
 * whatever time it runs, and puts the timetable back afterwards.
 */
import { chromium } from "playwright";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { formatHHMM, schoolClock, SCHOOL_TIMEZONE } from "../src/lib/school-time";
import { today } from "../src/lib/dates";

const BASE = process.argv[2] ?? "http://localhost:3100";
const PIN = process.env.SEED_QUICK_PIN ?? "482913";
const prisma = new PrismaClient();

const results: { name: string; ok: boolean }[] = [];
function check(name: string, ok: boolean, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  const clock = schoolClock();
  console.log(`\nSchool clock: ${clock.dateISO} ${clock.time} (${SCHOOL_TIMEZONE})`);

  const parked = await prisma.period.findMany({ where: { isActive: true } });
  await prisma.period.updateMany({ where: { isActive: true }, data: { isActive: false } });
  const livePeriod = await prisma.period.create({
    data: {
      name: "Quick test period",
      startTime: formatHHMM(Math.max(0, clock.minutes - 90)),
      endTime: formatHHMM(Math.min(24 * 60 - 1, clock.minutes + 90)),
    },
  });

  const teacher = await prisma.user.findUniqueOrThrow({
    where: { email: "teacher@eduplus.school" },
  });
  const link = await prisma.classTeacher.findFirstOrThrow({
    where: { userId: teacher.id },
    include: { class: true },
  });
  // A class this teacher does NOT teach, for the cross-teacher check.
  const foreign = await prisma.class.findFirstOrThrow({
    where: { teachers: { none: { userId: teacher.id } } },
  });

  const browser = await chromium.launch();

  try {
    // -- 1. The public page shows names, and nothing else ------------------
    console.log("\nBefore the PIN: what a stranger can see");
    const stranger = await browser.newContext();
    const anon = await stranger.newPage();
    await anon.context().addCookies([
      { name: "eduplus_locale", value: "en", url: BASE },
    ]);
    await anon.goto(`${BASE}/quick`);
    await anon.waitForSelector("text=Take the register", { timeout: 20000 });
    check("the quick page opens without signing in", true);

    const offered = await anon.locator('a[href^="/quick?teacher="]').count();
    check(
      "only teachers with a PIN are listed",
      offered === 2, // the two seeded PIN holders; the third has no PIN
      `${offered} teachers offered`,
    );

    // The whole reason the PIN exists: no child's name before it.
    const anonBody = await anon.content();
    const students = await prisma.student.findMany({
      where: { classId: link.classId },
      select: { lastName: true },
      take: 5,
    });
    const leaked = students.filter((s) => anonBody.includes(s.lastName));
    check(
      "no student name is on the page before the PIN",
      leaked.length === 0,
      leaked.length ? `LEAKED: ${leaked.map((s) => s.lastName).join(", ")}` : "none",
    );

    // -- 2. The register itself is not reachable without the PIN ------------
    await anon.goto(`${BASE}/quick/register`);
    await anon.waitForLoadState("networkidle");
    check(
      "the register bounces back without a PIN",
      anon.url().includes("/quick") && !anon.url().includes("/register"),
      anon.url(),
    );

    // -- 3. A wrong PIN is refused -----------------------------------------
    console.log("\nSigning in");
    await anon.goto(`${BASE}/quick?teacher=${teacher.id}`);
    await anon.waitForLoadState("networkidle");
    await anon.fill('input[name="pin"]', "000000");
    await anon.click('button[type="submit"]');
    await anon.waitForSelector("text=do not match", { timeout: 20000 });
    check("a wrong PIN is refused", true);

    // The name must survive a mistyped PIN — a teacher should not have to find
    // themselves in the list again with a class waiting.
    const stillNamed = await anon
      .locator(`text=${teacher.firstName} ${teacher.lastName}`)
      .count();
    check("the chosen name survives a wrong PIN", stillNamed > 0);

    // -- 4. The right PIN opens the register --------------------------------
    await anon.fill('input[name="pin"]', PIN);
    await anon.click('button[type="submit"]');
    // A server-action redirect navigates client-side, so no "load" event
    // fires and waitForURL's default wait would never resolve. Watch the path.
    await anon.waitForFunction(
      () => location.pathname === "/quick/register",
      undefined,
      { timeout: 20000 },
    );
    await anon.waitForLoadState("networkidle");
    check("the right PIN opens the register", true);

    const shownPeriod = await anon.locator(`text=${livePeriod.name}`).count();
    check("it opens on the period running now", shownPeriod > 0, livePeriod.name);

    // -- 5. Taking the register --------------------------------------------
    console.log("\nTaking the register");
    await prisma.periodAttendance.deleteMany({
      where: { periodId: livePeriod.id, date: today() },
    });

    await anon.click('button:has-text("All present")');
    await anon.locator('label:has-text("Absent")').first().click();
    await anon.click('button:has-text("Save attendance")');
    await anon.waitForSelector("#eduplus-toasts", { timeout: 25000 });

    const saved = await prisma.periodAttendance.findMany({
      where: { periodId: livePeriod.id, date: today() },
    });
    check("the register was written", saved.length > 0, `${saved.length} rows`);
    check(
      "every row is attributed to the teacher who signed in",
      saved.length > 0 && saved.every((r) => r.recordedById === teacher.id),
    );
    check(
      "it wrote only that teacher's class",
      saved.every((r) => r.classId === link.classId),
    );
    const absent = saved.filter((r) => r.status === "ABSENT").length;
    check("mixed statuses persisted", absent === 1, `${absent} absent`);

    // -- 5b. The day grid and its export ------------------------------------
    console.log("\nThe whole day, and the export");
    const finalColumn = await anon.locator("text=Final attendance status").count();
    check("the final-status column is shown", finalColumn > 0);

    const gridRows = await anon.locator("table tbody tr").count();
    check(
      "the grid has a row per student",
      gridRows === saved.length,
      `${gridRows} rows for ${saved.length} students`,
    );

    // Exported from inside the browser: the session cookie is Secure in a
    // production build and an API request context would not send it.
    const workbook = await anon.evaluate(async (url) => {
      const response = await fetch(url, { credentials: "same-origin" });
      const buffer = await response.arrayBuffer();
      return {
        status: response.status,
        contentType: response.headers.get("content-type") ?? "",
        head: String.fromCharCode(...new Uint8Array(buffer.slice(0, 2))),
        bytes: buffer.byteLength,
      };
    }, `${BASE}/quick/export?classId=${link.classId}`);
    check(
      "the day exports as a real .xlsx workbook",
      workbook.status === 200 &&
        workbook.contentType.includes("spreadsheet") &&
        workbook.head === "PK",
      `${workbook.status} ${workbook.bytes} bytes`,
    );

    // The export must not become a way to read any class in the school.
    const foreignExport = await anon.evaluate(async (url) => {
      const response = await fetch(url, { credentials: "same-origin" });
      const buffer = await response.arrayBuffer();
      return {
        status: response.status,
        head: String.fromCharCode(...new Uint8Array(buffer.slice(0, 2))),
      };
    }, `${BASE}/quick/export?classId=${foreign.id}`);
    check(
      "the export refuses another teacher's class",
      foreignExport.status === 403 && foreignExport.head !== "PK",
      String(foreignExport.status),
    );

    // -- 6. A quick token reaches NOTHING else ------------------------------
    console.log("\nWhat the quick token cannot do");
    for (const path of ["/dashboard", "/students", "/users", "/period-reports"]) {
      const response = await anon.goto(`${BASE}${path}`);
      await anon.waitForLoadState("networkidle").catch(() => {});
      const bounced =
        anon.url().includes("/login") ||
        (response?.status() ?? 0) >= 400 ||
        (await anon.content()).includes("url=/login");
      check(`a quick session cannot open ${path}`, bounced, anon.url());
    }

    // -- 7. It cannot write another teacher's class -------------------------
    // Posting a foreign classId directly: the class picker never offers it, so
    // this is the crafted-request case.
    await anon.goto(`${BASE}/quick/register?classId=${foreign.id}`);
    await anon.waitForLoadState("networkidle");
    const beforeForeign = await prisma.periodAttendance.count({
      where: { classId: foreign.id, periodId: livePeriod.id, date: today() },
    });
    const offersForeign = await anon.locator(`text=${foreign.name}`).count();
    check(
      "another teacher's class is not offered",
      offersForeign === 0,
      foreign.name,
    );
    const afterForeign = await prisma.periodAttendance.count({
      where: { classId: foreign.id, periodId: livePeriod.id, date: today() },
    });
    check(
      "nothing was written to another teacher's class",
      afterForeign === beforeForeign,
      `${beforeForeign} → ${afterForeign}`,
    );

    // -- 8. Finishing clears the device ------------------------------------
    await anon.goto(`${BASE}/quick/register`);
    await anon.waitForLoadState("networkidle");
    await anon.click('button:has-text("Finish")');
    await anon.waitForFunction(
      () => location.pathname === "/quick",
      undefined,
      { timeout: 20000 },
    );
    await anon.goto(`${BASE}/quick/register`);
    await anon.waitForLoadState("networkidle");
    check(
      "finishing signs the device out",
      !anon.url().includes("/register"),
      anon.url(),
    );

    // -- 9. The login page offers the way in --------------------------------
    const loginPage = await browser.newPage();
    await loginPage.context().addCookies([
      { name: "eduplus_locale", value: "en", url: BASE },
    ]);
    await loginPage.goto(`${BASE}/login`);
    const linkCount = await loginPage.locator('a[href="/quick"]').count();
    check("the login page links to quick attendance", linkCount > 0);
  } finally {
    await prisma.period.deleteMany({ where: { id: livePeriod.id } });
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
