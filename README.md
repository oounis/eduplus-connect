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
| Administrator | `admin@eduplus.school` | Everything: users, access rights, academic years, classes, students, assignments |
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

Access is enforced in three places: the middleware (signed-in or not), each page
(`requireModule`), and each server action (`assertModule`).

## Checks

```bash
bash scripts/smoke.sh            # every page for every role — granted vs denied
npx tsx scripts/ui-test.ts       # drives the real UI in Chromium end to end
npx tsx scripts/dev-token.ts <email>   # mint a session cookie for curl
```

`scripts/ui-test.ts` logs in as a supervisor and saves a register, checks a
supervisor cannot reach an unassigned class, checks staff see every register
read-only, adds an observation as a teacher, and confirms the admin dashboard
reflects both.

## Layout

```
prisma/schema.prisma      data model (SQLite; enums are strings + app constants)
prisma/seed.ts            demo school
src/lib/constants.ts      roles, modules, default role→module grants
src/lib/auth.ts           session → user → resolved module rights
src/lib/queries.ts        shared reads (visible classes, day/week summaries)
src/app/(app)/            the signed-in application, one folder per module
src/app/login/            sign-in
```
