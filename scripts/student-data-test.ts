/**
 * Student data, end to end — and, more importantly, what it refuses.
 *
 *   npx tsx scripts/student-data-test.ts [base-url]
 *
 * This is the second page in the application reachable without signing in, and
 * the one that carries the most: every child's name, their guardians' phone
 * numbers and their email addresses, editable. So the checks that matter are
 * the negative ones — no roster before the PIN, no other supervisor's classes,
 * no reaching it with a quick-attendance token, no widening an export past what
 * the page shows.
 *
 * Downloads are taken through the browser, never through `page.request`: in a
 * production build the session cookie is Secure and the request context will
 * not send it over plain http, which reports four working exports as broken.
 */
import { chromium, type Download, type Page } from "playwright";
import { PrismaClient } from "@prisma/client";
import ExcelJS from "exceljs";
import { toISODate } from "../src/lib/dates";
import { schoolClock } from "../src/lib/school-time";

const BASE = process.argv[2] ?? "http://localhost:3100";
const PIN = process.env.SEED_QUICK_PIN ?? "482913";
const prisma = new PrismaClient();

const results: { name: string; ok: boolean }[] = [];
function check(name: string, ok: boolean, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

/** Reads a downloaded workbook without writing it anywhere permanent. */
async function readWorkbook(download: Download): Promise<ExcelJS.Workbook> {
  const path = await download.path();
  if (!path) throw new Error("the browser produced no file");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path);
  return workbook;
}

/** Row values as plain strings, with the caption row skipped. */
function sheetRows(sheet: ExcelJS.Worksheet): string[][] {
  const rows: string[][] = [];
  sheet.eachRow((row) => {
    const values = row.values as (ExcelJS.CellValue | undefined)[];
    rows.push(values.slice(1).map((v) => (v === null || v === undefined ? "" : String(v))));
  });
  return rows;
}

async function signIn(page: Page, supervisorId: string, pin = PIN) {
  await page.goto(`${BASE}/student-data?supervisor=${supervisorId}`);
  await page.fill('input[name="pin"]', pin);
  await page.click('button[type="submit"]');
}

async function main() {
  const clock = schoolClock();
  console.log(`\nSchool clock: ${clock.dateISO} ${clock.time}`);

  const withPin = await prisma.user.findFirstOrThrow({
    where: { role: "SUPERVISOR", isActive: true, quickPin: { not: null } },
  });
  const withoutPin = await prisma.user.findFirst({
    where: { role: "SUPERVISOR", isActive: true, quickPin: null },
  });

  const mine = await prisma.classSupervisor.findMany({
    where: { userId: withPin.id },
    include: { class: true },
  });
  if (mine.length === 0) throw new Error("the seeded supervisor has no classes");
  const myClass = mine[0].class;

  // A class this supervisor does NOT supervise, for the cross-supervisor check.
  const foreign = await prisma.class.findFirstOrThrow({
    where: { supervisors: { none: { userId: withPin.id } } },
  });
  const foreignStudent = await prisma.student.findFirst({
    where: { classId: foreign.id, isActive: true },
  });

  const roster = await prisma.student.findMany({
    where: { classId: myClass.id, isActive: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
  if (roster.length < 2) throw new Error("need at least two students to test with");

  // Everything this run changes, put back in the finally block.
  const originals = roster.map((s) => ({
    id: s.id,
    email: s.email,
    phone: s.phone,
    phone2: s.phone2,
    phone3: s.phone3,
  }));

  /*
   * Two absences, planted on purpose.
   *
   * Comparing the sheet's total against the database is worthless if both are
   * zero: it passes on an empty register and could never fail. So this run
   * writes two known absences into the current month first, and the check then
   * has something to be wrong about.
   */
  const thisMonthISO = clock.dateISO.slice(0, 7);
  const plantedDays = [`${thisMonthISO}-02`, `${thisMonthISO}-03`];
  const plantedFor = roster[0];
  const plantedBefore = await prisma.attendance.findMany({
    where: {
      studentId: plantedFor.id,
      date: { in: plantedDays.map((d) => new Date(`${d}T00:00:00.000Z`)) },
    },
  });
  for (const day of plantedDays) {
    await prisma.attendance.upsert({
      where: {
        studentId_date: {
          studentId: plantedFor.id,
          date: new Date(`${day}T00:00:00.000Z`),
        },
      },
      update: { status: "ABSENT" },
      create: {
        date: new Date(`${day}T00:00:00.000Z`),
        status: "ABSENT",
        studentId: plantedFor.id,
        classId: myClass.id,
        recordedById: withPin.id,
      },
    });
  }

  // Kept so the "clearing the PIN" check can put it back exactly as it was.
  const pinHash = withPin.quickPin;

  const browser = await chromium.launch();

  try {
    // -- 1. What a stranger can see ---------------------------------------
    console.log("\nBefore the PIN: what a stranger can see");
    const stranger = await browser.newContext();
    const anon = await stranger.newPage();
    await anon.context().addCookies([
      { name: "eduplus_locale", value: "en", url: BASE },
    ]);
    await anon.goto(`${BASE}/student-data`);
    await anon.waitForSelector("text=Student data", { timeout: 20000 });
    check("the page opens without signing in", true);

    const offered = await anon.locator('a[href^="/student-data?supervisor="]').count();
    check(
      "only supervisors with a PIN are listed",
      offered === 1,
      `${offered} offered, ${withoutPin ? "1" : "0"} without a PIN in the database`,
    );
    if (withoutPin) {
      const body = await anon.content();
      check(
        "a supervisor with no PIN is not named",
        !body.includes(withoutPin.lastName),
        withoutPin.lastName,
      );
    }

    // The whole reason the PIN exists.
    const anonBody = await anon.content();
    const leaked = roster.filter((s) => anonBody.includes(s.lastName));
    check(
      "no student name is on the page before the PIN",
      leaked.length === 0,
      leaked.length ? `LEAKED: ${leaked.map((s) => s.lastName).join(", ")}` : "none",
    );
    const numbers = roster.filter((s) => s.phone && anonBody.includes(s.phone));
    check(
      "no phone number is on the page before the PIN",
      numbers.length === 0,
      numbers.length ? `LEAKED ${numbers.length}` : "none",
    );

    // -- 2. The workspace is not reachable without the PIN -----------------
    await anon.goto(`${BASE}/student-data/classes?classId=${myClass.id}`);
    await anon.waitForLoadState("networkidle");
    check(
      "the workspace redirects without a PIN",
      !anon.url().includes("/classes"),
      anon.url(),
    );

    // The exports are form navigations, so a refusal sends the person to the
    // sign-in step rather than replacing their page with a bare error. What
    // matters is that no workbook comes back.
    const anonExport = await anon.request.post(
      `${BASE}/student-data/export/students`,
      { form: { classId: myClass.id, scope: "class" }, maxRedirects: 0 },
    );
    check(
      "the student export serves nothing without a session",
      anonExport.status() === 303 &&
        (anonExport.headers()["location"] ?? "").endsWith("/student-data") &&
        !(anonExport.headers()["content-type"] ?? "").includes("spreadsheet"),
      `HTTP ${anonExport.status()} -> ${anonExport.headers()["location"] ?? "(none)"}`,
    );

    /*
     * A bare POST with no body at all.
     *
     * This one was found in production, not here: every check above posts a
     * well-formed body, and `request.formData()` THROWS on a request that has
     * none — so `curl -X POST` returned 500 where the page returned a redirect.
     * Nothing was ever served, but a 500 is the wrong answer and fills the log.
     */
    for (const route of ["students", "attendance", "messages"]) {
      const bare = await anon.request.post(
        `${BASE}/student-data/export/${route}`,
        { maxRedirects: 0 },
      );
      check(
        `a bodyless POST to the ${route} export is refused, not a 500`,
        bare.status() === 303 &&
          !(bare.headers()["content-type"] ?? "").includes("spreadsheet"),
        `HTTP ${bare.status()}`,
      );
    }

    // -- 3. A quick-attendance token is not a student-data token -----------
    const teacher = await prisma.user.findFirst({
      where: { role: "TEACHER", isActive: true, quickPin: { not: null } },
    });
    if (teacher) {
      const crossed = await browser.newContext();
      const crossedPage = await crossed.newPage();
      await crossedPage.context().addCookies([
        { name: "eduplus_locale", value: "en", url: BASE },
      ]);
      await crossedPage.goto(`${BASE}/quick?teacher=${teacher.id}`);
      await crossedPage.fill('input[name="pin"]', PIN);
      await crossedPage.click('button[type="submit"]');
      await crossedPage.waitForFunction(
        () => location.pathname.includes("/quick/register"),
        undefined,
        { timeout: 20000 },
      );
      await crossedPage.goto(`${BASE}/student-data/classes`);
      await crossedPage.waitForLoadState("networkidle");
      check(
        "a quick-attendance token does not open student data",
        !crossedPage.url().includes("/classes"),
        crossedPage.url(),
      );
      await crossed.close();
    }

    // -- 4. A wrong PIN ----------------------------------------------------
    const wrong = await browser.newContext();
    const wrongPage = await wrong.newPage();
    await wrongPage.context().addCookies([
      { name: "eduplus_locale", value: "en", url: BASE },
    ]);
    await signIn(wrongPage, withPin.id, "000123");
    await wrongPage.waitForSelector("text=do not match", { timeout: 20000 });
    check("a wrong PIN is refused", true);
    check(
      "a wrong PIN keeps the chosen name on screen",
      (await wrongPage.content()).includes(withPin.lastName),
    );
    await wrong.close();

    // -- 5. Signed in: their own classes, and only theirs ------------------
    console.log("\nAfter the PIN");
    const context = await browser.newContext({ acceptDownloads: true });
    const page = await context.newPage();
    await page.context().addCookies([
      { name: "eduplus_locale", value: "en", url: BASE },
    ]);
    await signIn(page, withPin.id);
    await page.waitForFunction(
      () => location.pathname.includes("/student-data/classes"),
      undefined,
      { timeout: 20000 },
    );
    check("the right PIN opens the classes page", true);

    const classLinks = await page
      .locator('a[href^="/student-data/classes?classId="]')
      .count();
    check(
      "every class assigned to them is offered",
      classLinks === mine.length,
      `${classLinks} of ${mine.length}`,
    );
    check(
      "a class that is not theirs is not offered",
      !(await page.content()).includes(`classId=${foreign.id}`),
      foreign.name,
    );

    // A crafted URL naming somebody else's class must not open it.
    await page.goto(`${BASE}/student-data/classes?classId=${foreign.id}`);
    await page.waitForLoadState("networkidle");
    const forcedBody = await page.content();
    check(
      "a crafted class id does not open another supervisor's class",
      !forcedBody.includes("Student contact details"),
      foreign.name,
    );
    if (foreignStudent) {
      check(
        "no student of that class is shown either",
        !forcedBody.includes(foreignStudent.lastName),
        foreignStudent.lastName,
      );
    }

    // -- 6. The roster, and the one button ---------------------------------
    await page.goto(`${BASE}/student-data/classes?classId=${myClass.id}`);
    await page.waitForSelector("text=Student contact details", { timeout: 20000 });
    const rows = await page.locator("table tbody tr").count();
    check("the class roster is shown", rows === roster.length, `${rows} rows`);

    const [first, second] = roster;
    const stamp = Date.now().toString().slice(-6);
    await page.fill(`input[name="phone:${first.id}"]`, `+973 1${stamp}`);
    await page.fill(`input[name="phone2:${first.id}"]`, `+973 2${stamp}`);
    await page.fill(`input[name="email:${second.id}"]`, `t${stamp}@example.com`);
    await page.click('button:has-text("Update student data")');
    await page.waitForSelector("text=updated", { timeout: 20000 });
    check("the save is confirmed on the page itself", true);

    const savedFirst = await prisma.student.findUniqueOrThrow({ where: { id: first.id } });
    const savedSecond = await prisma.student.findUniqueOrThrow({ where: { id: second.id } });
    check(
      "two students were written by one button",
      savedFirst.phone === `+973 1${stamp}` &&
        savedFirst.phone2 === `+973 2${stamp}` &&
        savedSecond.email === `t${stamp}@example.com`,
      `${savedFirst.phone} / ${savedSecond.email}`,
    );

    const audited = await prisma.auditEvent.count({
      where: { actorId: withPin.id, summary: { contains: "via student data" } },
    });
    check("the change is in the audit trail", audited >= 2, `${audited} entries`);

    // A bad email must stop the whole save, not half of it.
    //
    // The inputs are type=email, so the browser refuses to submit and the
    // server check is never reached — fine for a person, useless as a
    // guarantee, because a crafted post has no browser in front of it. Turn
    // the browser's own validation off first, so what is under test here is
    // the SERVER refusing.
    await page.evaluate((id) => {
      const field = document.querySelector(`input[name="email:${id}"]`);
      const form = field?.closest("form");
      if (form instanceof HTMLFormElement) form.noValidate = true;
    }, second.id);
    await page.fill(`input[name="email:${second.id}"]`, "not-an-address");
    await page.fill(`input[name="phone3:${first.id}"]`, "+973 999");
    await page.click('button:has-text("Update student data")');
    await page.waitForSelector("text=does not look right", { timeout: 20000 });
    const afterBad = await prisma.student.findUniqueOrThrow({ where: { id: first.id } });
    check(
      "one bad address saves nothing at all",
      afterBad.phone3 !== "+973 999",
      `phone3 is ${afterBad.phone3 ?? "null"}`,
    );

    // Length is a server rule too: maxLength only constrains typing, and a
    // crafted post has nobody typing. Postgres `text` would take a megabyte.
    await page.evaluate((id) => {
      const field = document.querySelector(`input[name="phone:${id}"]`);
      if (field instanceof HTMLInputElement) field.removeAttribute("maxlength");
      const form = field?.closest("form");
      if (form instanceof HTMLFormElement) form.noValidate = true;
    }, first.id);
    await page.fill(`input[name="phone:${first.id}"]`, "9".repeat(500));
    await page.click('button:has-text("Update student data")');
    await page.waitForSelector("text=too long", { timeout: 20000 });
    const afterLong = await prisma.student.findUniqueOrThrow({ where: { id: first.id } });
    check(
      "an over-long value is refused by the server, not just the browser",
      (afterLong.phone?.length ?? 0) <= 40,
      `phone is ${afterLong.phone?.length ?? 0} characters`,
    );

    // -- 7. The student list export ----------------------------------------
    console.log("\nThe Excel files");
    await page.reload();
    await page.waitForSelector("text=Student contact details", { timeout: 20000 });

    const [listDownload] = await Promise.all([
      page.waitForEvent("download", { timeout: 30000 }),
      page.click('button:has-text("Export the student list")'),
    ]);
    const listBook = await readWorkbook(listDownload);
    const listSheet = listBook.worksheets[0];
    const listRows = sheetRows(listSheet);
    // Row 1 is the caption, row 2 the header.
    check(
      "the student list has the ten columns that were asked for",
      listRows[1].length === 10 &&
        listRows[1][0] === "No." &&
        listRows[1][4] === "Class" &&
        listRows[1][9] === "Notes",
      listRows[1].join(" | "),
    );
    check(
      "it holds one row per student in the class",
      listRows.length - 2 === roster.length,
      `${listRows.length - 2} of ${roster.length}`,
    );
    check(
      "the number just saved is in it",
      listRows.some((row) => row.includes(`+973 1${stamp}`)),
    );

    // Ticking students narrows it; it can never widen it.
    await page.locator('table tbody tr input[type="checkbox"]').first().check();
    const [narrowed] = await Promise.all([
      page.waitForEvent("download", { timeout: 30000 }),
      page.click('button:has-text("Export the student list")'),
    ]);
    const narrowedRows = sheetRows((await readWorkbook(narrowed)).worksheets[0]);
    check(
      "ticking one student exports one student",
      narrowedRows.length - 2 === 1,
      `${narrowedRows.length - 2} row(s)`,
    );

    // A student id belonging to another class is a narrowing filter applied on
    // top of the class filter, never a way past it: it selects nothing.
    //
    // Untick first: with the student from the check above still ticked, this
    // would export that one student and pass for the wrong reason.
    await page.locator('table tbody tr input[type="checkbox"]').first().uncheck();
    if (foreignStudent) {
      await page.evaluate((id) => {
        const form = document
          .querySelector('form[action="/student-data/export/students"]');
        if (!(form instanceof HTMLFormElement)) return;
        const field = document.createElement("input");
        field.type = "hidden";
        field.name = "student";
        field.value = id;
        form.appendChild(field);
      }, foreignStudent.id);
      const [forged] = await Promise.all([
        page.waitForEvent("download", { timeout: 30000 }),
        page.click('button:has-text("Export the student list")'),
      ]);
      const forgedRows = sheetRows((await readWorkbook(forged)).worksheets[0]);
      check(
        "a forged student id from another class exports nothing",
        forgedRows.length - 2 === 0 &&
          !forgedRows.flat().some((cell) => cell.includes(foreignStudent.lastName)),
        `${forgedRows.length - 2} row(s)`,
      );
      await page.reload();
      await page.waitForSelector("text=Student contact details", { timeout: 20000 });
    }

    // -- 8. The monthly attendance table ------------------------------------
    const [attendanceDownload] = await Promise.all([
      page.waitForEvent("download", { timeout: 60000 }),
      page.click('button:has-text("Export the monthly attendance table")'),
    ]);
    const attendanceBook = await readWorkbook(attendanceDownload);
    check(
      "the attendance workbook has one sheet per month",
      attendanceBook.worksheets.length >= 1 &&
        attendanceBook.worksheets.every((s) => /^\d{4}-\d{2}$/.test(s.name)),
      attendanceBook.worksheets.map((s) => s.name).join(", "),
    );

    const thisMonth = clock.dateISO.slice(0, 7);
    const monthSheet = attendanceBook.worksheets.find((s) => s.name === thisMonth);
    check("the current month is one of them", Boolean(monthSheet), thisMonth);

    if (monthSheet) {
      const monthRows = sheetRows(monthSheet);
      const header = monthRows[1];
      const daysThisMonth = new Date(
        Date.UTC(Number(thisMonth.slice(0, 4)), Number(thisMonth.slice(5, 7)), 0),
      ).getUTCDate();
      check(
        "a column for every day of the month, plus the total",
        header.length === 3 + daysThisMonth + 1 &&
          header[3] === "1" &&
          header[header.length - 1] === "Absences this month",
        `${header.length} columns for ${daysThisMonth} days`,
      );

      // Check one student's total against the database, computed here rather
      // than by the code under test.
      const monthStart = new Date(`${thisMonth}-01T00:00:00.000Z`);
      const monthEnd = new Date(
        Date.UTC(Number(thisMonth.slice(0, 4)), Number(thisMonth.slice(5, 7)), 0),
      );
      const classIds = mine.map((m) => m.classId);
      const dailyRows = await prisma.attendance.findMany({
        where: { classId: { in: classIds }, date: { gte: monthStart, lte: monthEnd } },
        select: { studentId: true, date: true, status: true },
      });
      const periodRows = await prisma.periodAttendance.findMany({
        where: { classId: { in: classIds }, date: { gte: monthStart, lte: monthEnd } },
        select: { studentId: true, date: true, status: true },
      });
      const expected = new Map<string, number>();
      const dayStatus = new Map<string, string>();
      for (const row of periodRows) {
        const key = `${row.studentId}|${toISODate(row.date)}`;
        const rank: Record<string, number> = { ABSENT: 4, EXCUSED: 3, LATE: 2, PRESENT: 1 };
        const current = dayStatus.get(key);
        if (!current || rank[row.status] > rank[current]) dayStatus.set(key, row.status);
      }
      for (const row of dailyRows) {
        dayStatus.set(`${row.studentId}|${toISODate(row.date)}`, row.status);
      }
      for (const [key, status] of dayStatus) {
        if (status !== "ABSENT") continue;
        const studentId = key.split("|")[0];
        expected.set(studentId, (expected.get(studentId) ?? 0) + 1);
      }

      const sample = plantedFor;
      const sampleRow = monthRows.find(
        (row) => row[2] === `${sample.lastName} ${sample.firstName}`,
      );
      const expectedAbsences = expected.get(sample.id) ?? 0;
      check(
        "the planted absences are actually in the database",
        expectedAbsences >= plantedDays.length,
        `${expectedAbsences} absence(s)`,
      );
      check(
        "a student's absence total matches the database",
        Boolean(sampleRow) &&
          expectedAbsences > 0 &&
          Number(sampleRow![sampleRow!.length - 1]) === expectedAbsences,
        `sheet says ${sampleRow?.[sampleRow.length - 1]}, database says ${expectedAbsences}`,
      );
      // The day columns start at index 3, so day 2 is index 4.
      check(
        "the day cell of a planted absence says absent",
        sampleRow?.[4] === "A",
        `${thisMonthISO}-02 cell is "${sampleRow?.[4]}"`,
      );

      // "All my classes" is the default for this export, so every class the
      // supervisor holds should be represented and no other.
      const classNames = new Set(monthRows.slice(2).map((row) => row[1]));
      check(
        "it covers every class of theirs and no other",
        mine.every((m) => classNames.has(m.class.name)) && !classNames.has(foreign.name),
        [...classNames].join(", "),
      );
    }

    // -- 9. The message file ------------------------------------------------
    const twoNumbers = roster.find((s) => s.id === first.id)!;
    await page.locator(`input[name="phone3:${twoNumbers.id}"]`).fill("");
    // Tick exactly this student, so the file is small enough to assert on.
    const checkboxes = page.locator('table tbody tr input[type="checkbox"]');
    const index = roster.findIndex((s) => s.id === twoNumbers.id);
    await checkboxes.nth(index).check();

    await page.fill('textarea[name="text"]', "we are informing you of a delay today.");
    await page.locator('input[name="field"][value="phone2"]').check();

    const [messageDownload] = await Promise.all([
      page.waitForEvent("download", { timeout: 30000 }),
      page.click('button:has-text("Create the Excel file")'),
    ]);
    const messageBook = await readWorkbook(messageDownload);
    const messageRows = sheetRows(messageBook.worksheets[0]);
    check(
      "the message file has exactly two columns",
      messageRows[1].length === 2 &&
        messageRows[1][0] === "Phone" &&
        messageRows[1][1] === "Message",
      messageRows[1].join(" | "),
    );
    check(
      "a second number becomes a second row under the same column",
      messageRows.length - 2 === 2,
      `${messageRows.length - 2} row(s) for one student with two numbers`,
    );
    check(
      "both rows carry that student's own named message",
      messageRows
        .slice(2)
        .every(
          (row) =>
            row[1].includes(twoNumbers.lastName) &&
            row[1].includes("informing you of a delay"),
        ),
      messageRows[2]?.[1] ?? "",
    );
    check(
      "the numbers are the ones on that student",
      messageRows.slice(2).map((r) => r[0]).sort().join(",") ===
        [`+973 1${stamp}`, `+973 2${stamp}`].sort().join(","),
      messageRows.slice(2).map((r) => r[0]).join(", "),
    );

    // A student with no number at all is named, not silently dropped.
    await prisma.student.update({
      where: { id: second.id },
      data: { phone: null, phone2: null, phone3: null },
    });
    await page.reload();
    await page.waitForSelector("text=Student contact details", { timeout: 20000 });
    await page.locator('table tbody tr input[type="checkbox"]').nth(
      roster.findIndex((s) => s.id === second.id),
    ).check();
    await page.fill('textarea[name="text"]', "we are informing you of a delay today.");
    const [skipDownload] = await Promise.all([
      page.waitForEvent("download", { timeout: 30000 }),
      page.click('button:has-text("Create the Excel file")'),
    ]);
    const skipBook = await readWorkbook(skipDownload);
    const noPhone = skipBook.worksheets.find((s) => s.name === "No phone number");
    check(
      "a student with no number is listed rather than dropped",
      Boolean(noPhone) &&
        sheetRows(noPhone!).some((row) => row.join(" ").includes(second.lastName)),
      second.lastName,
    );

    // -- 9b. Narrowing the table must not throw away what was typed --------
    console.log("\nThe things that used to be lost");
    await page.goto(`${BASE}/student-data/classes?classId=${myClass.id}`);
    await page.waitForSelector("text=Student contact details", { timeout: 20000 });
    await page.fill(`input[name="phone:${first.id}"]`, "+973 7000001");
    await page.fill(`input[name="phone:${second.id}"]`, "+973 7000002");
    await page.selectOption("#filter", first.id);
    await page.selectOption("#filter", "ALL");
    check(
      "filtering to one student and back keeps every unsaved edit",
      (await page.inputValue(`input[name="phone:${first.id}"]`)) === "+973 7000001" &&
        (await page.inputValue(`input[name="phone:${second.id}"]`)) === "+973 7000002",
      `${await page.inputValue(`input[name="phone:${second.id}"]`)}`,
    );

    // -- 9c. A selection must not follow you into another class ------------
    if (mine.length > 1) {
      await page.locator('table tbody tr input[type="checkbox"]').first().check();
      await page.click(`a[href="/student-data/classes?classId=${mine[1].classId}"]`);
      // Wait for the URL, not for a heading that was already on screen before
      // the click — that matched the old page and counted the old checkboxes.
      await page.waitForFunction(
        (id) => location.search.includes(id),
        mine[1].classId,
        { timeout: 20000 },
      );
      await page.waitForSelector("text=Student contact details", { timeout: 20000 });
      const stillTicked = await page
        .locator('table tbody tr input[type="checkbox"]:checked')
        .count();
      check(
        "switching class clears the previous class's selection",
        stillTicked === 0,
        `${stillTicked} still ticked`,
      );
    }

    // -- 9d. Clearing the PIN ends a live session, and does not loop -------
    await prisma.user.update({ where: { id: withPin.id }, data: { quickPin: null } });
    await page.goto(`${BASE}/student-data/classes?classId=${myClass.id}`);
    await page.waitForLoadState("networkidle");
    check(
      "clearing the PIN ends the session already in progress",
      !page.url().includes("/classes"),
      page.url(),
    );
    // The bug this replaced was not "still allowed" but "redirects forever":
    // the entry page bounced back to the workspace, which bounced back here.
    check(
      "and lands on the sign-in step rather than looping",
      page.url().endsWith("/student-data"),
      page.url(),
    );
    const revoked = await page.request.post(
      `${BASE}/student-data/export/students`,
      { form: { classId: myClass.id, scope: "class" }, maxRedirects: 0 },
    );
    check(
      "and its exports serve nothing either",
      revoked.status() === 303 &&
        !(revoked.headers()["content-type"] ?? "").includes("spreadsheet"),
      `HTTP ${revoked.status()}`,
    );
    await prisma.user.update({
      where: { id: withPin.id },
      data: { quickPin: pinHash },
    });

    // -- 10. Finishing ------------------------------------------------------
    // The cookie this context holds became valid again the moment the PIN was
    // put back, so there is no PIN form to fill: the entry page sends a live
    // session straight to the workspace.
    await page.goto(`${BASE}/student-data/classes?classId=${myClass.id}`);
    await page.waitForSelector("text=Student contact details", { timeout: 20000 });
    await page.click('button:has-text("Finish")');
    // Waiting for the URL, not for the network: the page is already idle when
    // the button is clicked, so `networkidle` returns before the action has
    // even replied and the next navigation still carries the cookie.
    await page.waitForFunction(
      () => location.pathname === "/student-data",
      undefined,
      { timeout: 20000 },
    );
    await page.goto(`${BASE}/student-data/classes?classId=${myClass.id}`);
    await page.waitForLoadState("networkidle");
    check(
      "finishing signs the device out",
      !page.url().includes("/classes"),
      page.url(),
    );

    // -- 11. The way in is offered ------------------------------------------
    const loginPage = await context.newPage();
    await loginPage.context().addCookies([
      { name: "eduplus_locale", value: "en", url: BASE },
    ]);
    await loginPage.goto(`${BASE}/login`);
    check(
      "the login page links to student data",
      (await loginPage.locator('a[href="/student-data"]').count()) > 0,
    );
  } finally {
    await prisma.user.update({
      where: { id: withPin.id },
      data: { quickPin: pinHash },
    });
    await prisma.attendance.deleteMany({
      where: {
        studentId: plantedFor.id,
        date: { in: plantedDays.map((d) => new Date(`${d}T00:00:00.000Z`)) },
      },
    });
    for (const row of plantedBefore) {
      await prisma.attendance.create({
        data: {
          date: row.date,
          status: row.status,
          note: row.note,
          studentId: row.studentId,
          classId: row.classId,
          recordedById: row.recordedById,
        },
      });
    }
    for (const original of originals) {
      await prisma.student.update({
        where: { id: original.id },
        data: {
          email: original.email,
          phone: original.phone,
          phone2: original.phone2,
          phone3: original.phone3,
        },
      });
    }
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
