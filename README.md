# EduPlus Connect

School management web application — roles, two attendance registers (daily and
period-by-period), observations, staff tasks, exportable reports and a full
audit trail, with per-module access rights controlled by the administrator.
Arabic by default, English one click away, right-to-left throughout.

📚 **[Full documentation →](docs/)** — product, architecture, infrastructure,
operations runbook, capacity, and an honest
[status and roadmap](docs/06-status.md).

## Stack

Next.js 15 (App Router, Server Actions) · React 19 · Prisma 6 ·
**PostgreSQL 16** · Tailwind CSS 4 · `jose` JWT session cookie · bcrypt password
hashes · exceljs.

## Run it locally

PostgreSQL in every environment — the same engine locally and in production, so
a query cannot behave one way on a laptop and another on the server.

```bash
docker compose -f docker-compose.dev.yml up -d   # Postgres 16 on :55432
cp .env.example .env                              # DATABASE_URL, AUTH_SECRET, SCHOOL_TIMEZONE
npm install
npm run setup                                     # migrate + seed
npm run dev                                       # http://localhost:3100
```

## Deployment

Two servers: nginx + Next.js replicas on one, PostgreSQL + pgBouncer + backups
on the other, joined by WireGuard with only 80/443 exposed.

Configuration lives in [`deploy/`](deploy/); the step-by-step is in
[docs/04-operations.md](docs/04-operations.md).

```bash
docker compose -f docker-compose.dev.yml up -d   # local
cd deploy/db  && docker compose up -d             # server 2
cd deploy/app && docker compose up -d --build     # server 1
```

Schema changes are ordinary Prisma migrations:

```bash
npm run db:migrate      # development — creates the migration
npm run db:deploy       # production  — applies pending migrations
```

## Demo accounts

All seeded accounts share the password in `SEED_PASSWORD` (`Passw0rd!` by default).

| Role | Email | Sees |
| --- | --- | --- |
| Administrator | `admin@eduplus.school` | Everything: users, access rights, academic years, classes, students, assignments, reports, history |
| Deputy | `deputy@eduplus.school` | Dashboard, classes, students, attendance, observations, staff tasks (edit) |
| Staff | `staff@eduplus.school` | Same views as the deputy, read-only |
| Supervisor | `supervisor@eduplus.school`, `supervisor2@…` | Their assigned classes — takes the daily register |
| Teacher | `teacher@eduplus.school`, `teacher2@…`, `teacher3@…` | Their assigned classes — writes daily observations |
| Parent | `parent@eduplus.school`, `parent2@…` | Their own children only |
| Student | `student@eduplus.school` | Their own record only |

The seed builds one academic year with three terms, 6 classes, ~90 students,
class assignments for supervisors and teachers, and a partial day of attendance
and observations so the dashboards are not empty.

## Roles and rules

- **Admin** manages users and grants module rights per role (and per user as an
  override), plus academic years, terms, classes, students and the assignment of
  classes to supervisors and teachers.
- **Deputy** creates and assigns staff tasks.
- **Supervisors** take attendance daily, one row per student per day, only for
  the classes assigned to them.
- **Attendance is also taken period by period** (`/period-attendance`), which is
  a separate register from the supervisor's daily one — both exist, neither
  replaces the other. The admin defines the school day once under **School day**
  (`/periods`): a period is a name and a start/end time, and the same list
  applies to every school day. The page opens on the period running *now*, then
  narrows teacher → class → students.

  **A teacher writes only their own class, only today, and only while that
  period is running.** When the period ends the register closes; an admin or
  deputy can still correct it, and the correction is written to the history.
  "Now" is the school's own clock — `SCHOOL_TIMEZONE`, `Asia/Bahrain` by
  default — because the server runs in UTC and would otherwise unlock the wrong
  period. Period times are stored as "HH:MM" wall-clock strings, not instants,
  so the timetable does not move when the clocks change.
- **Period reports** (`/period-reports`) aggregate any range three ways — by
  period, by period and class, and by day and period — over one class or several
  at once, and export as a real four-sheet Excel workbook.
- **Teachers** write dated observations (category + sentiment + note) for the
  students of the classes assigned to them.
- **Admin / Deputy / Staff** dashboards summarise today's attendance across all
  classes and this week's observations across all classes.
- **Every student has a profile** (`/students/<id>`) with their attendance
  history, their observations and a 30 / 90 / 365-day window. Staff reach it
  from the student list, parents from their dashboard; a parent only ever opens
  their own child, a teacher only students of the classes assigned to them.
- **Reports** (`/reports`) aggregate any date range: per class, per student
  (worst attendance first), an observation category x sentiment matrix and a
  daily trend — each exportable as CSV. A supervisor's export contains only
  their own classes.
- **Every user manages their own account** at `/profile`: phone number,
  password change, and a read-out of exactly which modules they hold.
- **Students arrive in bulk** — paste a CSV on `/students` and the first submit
  only *reports* what would happen: which rows are ready, and for each rejected
  row why (missing name, duplicate code, unknown class, unknown parent). Nothing
  is written until the second submit, and a bad row is skipped rather than
  guessed at. Blank codes are generated; dates take `YYYY-MM-DD` or `DD/MM/YYYY`.
- **Terms drive the reports** — every term of the current year is a one-click
  period on `/reports`, alongside last 7 / last 30 days and the whole year.
- **Nothing changes without a trace** — `/audit` (administrator only) records
  who did what to accounts, access rights, years, terms, classes, students,
  assignments, tasks, registers and deleted observations, filterable by entity
  and by person. The actor's name is copied into each row, so history stays
  readable after an account is deleted.

Access is enforced in three places: the middleware (signed-in or not), each page
(`requireModule`), and each server action (`assertModule`).

## Checks

```bash
bash scripts/smoke.sh            # every page for every role — granted vs denied
npm run test                     # unit tests
npm run test:i18n                # the two dictionaries agree
npm run test:ui                  # drives the real UI in Chromium end to end
npm run test:periods             # attendance by period, end to end
npx tsx scripts/dev-token.ts <email>   # mint a session cookie for curl
npm run db:sync-access           # grant a newly added module on an existing DB
```

The browser tests pin the interface to English with the `eduplus_locale`
cookie, because the app now opens in Arabic and every text selector would
otherwise be looking for a string the page does not render.

Both `smoke.sh` and `ui-test.ts` judge a refusal by what the page *shows*, not
by its status code. A production server answers `redirect("/denied")` with a
307 and `notFound()` with a 404, but the dev server has already started
streaming and answers **200** with the refusal in the body. Checking the status
alone scored every blocked page as "ok" and would have hidden a real access
regression.

`scripts/ui-test.ts` (39 checks) logs in as a supervisor and saves a register,
checks a supervisor cannot reach an unassigned class, checks staff see every
register read-only, adds an observation as a teacher, confirms the admin
dashboard reflects both, proves the student profile is closed to the wrong
parent and the wrong teacher, downloads each CSV export and checks a parent is
refused one, changes a password and signs in again with it, imports a CSV of
six rows and checks the four bad ones are each rejected for the right reason,
confirms the import and the register save both appear in the history and that a
teacher cannot open it, and clicks a term chip to check it sets the report
range. It cleans up after itself, so it can be run repeatedly.

After adding a module to `MODULES`, run `npm run db:sync-access` — it grants the
defaults for the new module without touching the rights an administrator has
already customised in `/access`.

## Layout

```
prisma/schema.prisma      data model (PostgreSQL; enums are strings + app constants)
prisma/migrations/        Prisma migration history
src/instrumentation.ts    startup config check — refuses a bad production config
deploy/                   production configuration for the two servers
docs/                     product, architecture, infrastructure, operations
prisma/migrations/        hand-applied SQL for the hosted database
src/lib/school-time.ts    the school's wall clock, and which period is live
src/lib/periods.ts        period queries + the one rule for who may write
src/lib/audit.ts          append-only history writer used by every mutation
prisma/seed.ts            demo school
src/lib/constants.ts      roles, modules, default role→module grants
src/lib/auth.ts           session → user → resolved module rights
src/lib/queries.ts        shared reads (visible classes, day/week summaries)
src/lib/reports.ts        report scope (range + allowed classes) and CSV writer
src/app/(app)/            the signed-in application, one folder per module
src/app/(app)/reports/export/  CSV route handler
src/app/(app)/students/import-actions.ts  CSV parse, dry run, then write
src/app/login/            sign-in
```
