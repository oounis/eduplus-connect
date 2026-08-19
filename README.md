# EduPlus Connect

School management web application — roles, daily attendance, daily observations
and staff tasks, with per-module access rights controlled by the administrator.

## Stack

Next.js 15 (App Router, Server Actions) · React 19 · Prisma 6 · SQLite (dev) ·
Tailwind CSS 4 · `jose` JWT session cookie · bcrypt password hashes.

## Run it locally

```bash
cp .env.example .env      # DATABASE_URL, AUTH_SECRET, SEED_PASSWORD
npm install
npm run setup             # prisma generate + db push + seed
npm run dev               # http://localhost:3100
```

## Demo accounts

All seeded accounts share the password in `SEED_PASSWORD` (`Passw0rd!` by default).

| Role | Email | Sees |
| --- | --- | --- |
| Administrator | `admin@eduplus.school` | Everything: users, access rights, academic years, classes, students, assignments, reports |
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

Access is enforced in three places: the middleware (signed-in or not), each page
(`requireModule`), and each server action (`assertModule`).

## Checks

```bash
bash scripts/smoke.sh            # every page for every role — granted vs denied
npx tsx scripts/ui-test.ts       # drives the real UI in Chromium end to end
npx tsx scripts/dev-token.ts <email>   # mint a session cookie for curl
npm run db:sync-access           # grant a newly added module on an existing DB
```

`scripts/ui-test.ts` (26 checks) logs in as a supervisor and saves a register,
checks a supervisor cannot reach an unassigned class, checks staff see every
register read-only, adds an observation as a teacher, confirms the admin
dashboard reflects both, proves the student profile is closed to the wrong
parent and the wrong teacher, downloads each CSV export and checks a parent is
refused one, and changes a password and signs in again with it.

After adding a module to `MODULES`, run `npm run db:sync-access` — it grants the
defaults for the new module without touching the rights an administrator has
already customised in `/access`.

## Layout

```
prisma/schema.prisma      data model (SQLite; enums are strings + app constants)
prisma/seed.ts            demo school
src/lib/constants.ts      roles, modules, default role→module grants
src/lib/auth.ts           session → user → resolved module rights
src/lib/queries.ts        shared reads (visible classes, day/week summaries)
src/lib/reports.ts        report scope (range + allowed classes) and CSV writer
src/app/(app)/            the signed-in application, one folder per module
src/app/(app)/reports/export/  CSV route handler
src/app/login/            sign-in
```
