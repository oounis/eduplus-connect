# 01 — The Product

## What EduPlus Connect is

A school management system for the daily running of a school: who works there,
what they are allowed to see, who was in class, what teachers noticed, what
staff have to do, and what all of that adds up to over a term.

It is not a learning platform. It has no lessons, no grading engine, no
timetable solver and no messaging. It does one job — **the operational record of
a school day** — and it does it in Arabic and English.

## Who uses it

Seven roles. Each sees a different application, because access is granted per
screen rather than per page-you-happen-to-know-the-URL-of.

| Role | What they do | What they see |
|---|---|---|
| **Administrator** | Runs the system | Everything: accounts, access rights, academic years, classes, students, assignments, the school day, reports, history |
| **Deputy** | Runs the staff | Dashboards, classes, students, both attendance registers, observations, staff tasks (creates and assigns), reports |
| **Staff** | Office / admin support | The same views as the deputy, read-only |
| **Supervisor** | Takes the daily register | Their assigned classes, the daily attendance register (writes), reports for their own classes |
| **Teacher** | Teaches, and records what happened | Their assigned classes, the period register (writes, during the period), observations (writes), reports for their own classes |
| **Parent** | Follows their own child | Their children only: attendance, observations, a 30/90/365-day history |
| **Student** | Follows themselves | Their own record only |

The role is a starting point, not a cage: an administrator can grant or remove
any module for any role, and override it for one individual person.

## The features, one by one

### 1. Accounts and access rights

Every screen in the application is a **module**. There are fifteen. Access is a
grid of (role × module) with two switches each — *view* and *edit* — plus
per-user overrides that win over the role.

The grid is editable at `/access` by an administrator. Granting *edit* without
*view* is meaningless, so the system normalises it rather than storing a
contradiction.

Access is enforced in **three independent places**, deliberately:

1. **Middleware** — is there a valid session at all?
2. **The page** — `requireModule("students")` before anything renders.
3. **The server action** — `assertModule("students")` before anything is written.

A missing check in one layer does not open the door, because a mutation is
never reachable without the action's own check. This matters more than it
sounds: the page and the action are separate entry points, and an attacker
posts to the action.

### 2. Academic years and terms

A year has a name, a start, an end, and a set of terms. One year is *current*,
and everything else — classes, attendance, observations, reports — hangs off it.
Deleting a year that still holds classes is refused rather than cascaded.

Terms matter because they are how a school thinks about time: the reports page
offers every term of the current year as a one-click date range.

### 3. Classes, students, and assignments

Classes belong to a year. Students belong to a class, and optionally to a parent
account and to a student account of their own.

**Students arrive in bulk.** Paste a CSV at `/students` and the first submit
does not write anything — it *reports* what would happen: which rows are ready,
and for each rejected row, why. Missing name. Duplicate code. Unknown class.
Unknown parent. The second submit writes only the good rows; a bad row is
skipped, never guessed at. Blank student codes are generated. Dates are accepted
as `YYYY-MM-DD` or `DD/MM/YYYY`.

That two-pass design is the difference between an import tool a school will use
and one they will be frightened of.

**Assignments** link classes to the supervisors who take their register and the
teachers who teach them. A teacher can be assigned many classes, with a subject
per class.

### 4. The daily attendance register

One row per student per day, written by the class **supervisor**, for their own
classes only.

Present / Absent / Late / Excused, with an optional note per student, and a
"mark everyone present" shortcut because that is the common case. Administration
sees every class read-only; the supervisor sees only theirs.

A register cannot be taken for a future date. "Today" means **the school's
today**, not the server's — see [02 — Architecture](02-architecture.md#time).

### 5. Attendance by period *(added 2026-08-28)*

The second register, and a different question: not "was the student in school"
but "were they in the room, this period".

**The admin defines the school day once** at `/periods` — a period is a name and
a start and end time, and the same list applies to every school day. Overlapping
periods are refused, so two can never be running at the same moment. A period
can be taken out of use without destroying the records taken in it.

**The teacher's page** (`/period-attendance`) opens on the period running *right
now*, then narrows: teacher → their classes → that class's students.

The rule that makes it trustworthy:

> A teacher writes **their own class**, **today**, and **only while that period
> is running**. When the period ends, the register closes.

An administrator or deputy can still correct a closed period, and the correction
is written to the audit trail with their name on it. So the record is both
honest — nobody fills in a whole week on Friday afternoon — and fixable.

The write rule lives in exactly one function, and the server action re-derives
it rather than trusting the form. A page left open past the bell cannot post
into a closed register.

### 5b. Quick attendance — the classroom device *(added 2026-08-29)*

A teacher standing in front of a class does not want to type an email address
and a password on a shared tablet. So the login page carries a second way in:
**تسجيل الحضور والغياب / الحصص** — "Attendance / Periods".

1. Pick your name from a list.
2. Type a short PIN.
3. You land on the register for the period running right now.

**Why there is a PIN.** The request was for a page reachable without logging in
at all. Left fully open, that page publishes the name of every child in the
school to anyone who finds the URL, and lets any visitor file attendance under a
named teacher's identity — which also makes the audit trail worthless. A
six-digit PIN keeps what the request was actually for (no credentials on a
shared device, during a 45-minute period) without either consequence.

What it deliberately is and is not:

| | |
|---|---|
| **Public before the PIN** | Only the list of teacher names — the minimum the "choose your name" step needs. No class, no student, no roster. |
| **Behind the PIN** | That teacher's own classes, and the register for the live period. |
| **Reaches** | Nothing else. The token lives under its own cookie with its own audience; no other page in the app reads it. A quick session cannot open the dashboard, students, users or reports. |
| **Attribution** | Every row records the teacher who signed in, and the history marks it as taken via quick access. |
| **Opt-in per teacher** | No PIN means they do not appear on the page at all. An administrator sets one on each teacher's account. |
| **Rate limited** | Per teacher *and* per address, so neither guessing one PIN nor spraying one PIN across every teacher is practical. |
| **Finish** | Clears the device — important, because the next person to pick it up is a different teacher. |

The PIN is stored hashed, like a password, and is never written to the audit
trail. An administrator who forgets one sets a new one rather than reading it
back.

**The classroom register offers three states, not four** — present, absent,
excused. "Late" is a judgement made minutes into a lesson; this page is used at
the door with a class waiting, and a fourth button there is a fourth thing to
get wrong. The desk register still has it, and an administrator can still set
it, so nothing is lost from the record.

**Under the register: the whole day for that class.** A row per student, a
column per period, and a final column — **حالة الحضور النهائي**, the day's
verdict. That column carries the status from the *last* period actually
recorded, not the first: a student marked absent at 08:00 who arrives by the
third period ends the day present, and that is what a parent should be told.
The footer shows how many were away in each period and who took each register.

**Export the day to Excel** — three sheets:

| Sheet | Holds |
|---|---|
| Day by period | The grid: every student, every period, and the final status |
| Per period | Each period with its time, **who took it**, and the present / absent / late / excused counts |
| Final status | The day's totals by final status |

The export is guarded the same way the page is: it checks the class is one the
signed-in teacher is actually assigned to, rather than trusting the id in the
query string — otherwise it would hand any class in the school to anyone
holding any teacher's PIN. That is a test, not an intention.

### 6. Observations

Dated, free-text notes written by **teachers** about students in their classes.
Each carries a category (Behaviour, Participation, Homework, Academic, Other)
and a sentiment (Positive, Neutral, Concern).

The sentiment is what makes them aggregable: "concerns this week, by class" is a
question a head teacher actually asks, and the dashboard answers it.

### 7. Staff tasks

The deputy creates tasks, assigns them to staff, and tracks them through
To do → In progress → Done → Cancelled, with a priority and a due date. Staff
see and update their own.

### 8. Reports

Two report surfaces, because they answer different questions.

**`/reports`** — attendance and observations over any date range:
per class, per student (worst attendance first), an observation
category × sentiment matrix, and a daily trend. Quick ranges for last 7 days,
last 30 days, each term, and the whole year. Exports to CSV and to Excel.

**`/period-reports`** — the period dimension: by period, by period and class,
and by day and period. One class or several at once. Exports a four-sheet Excel
workbook, the fourth sheet being every underlying record so the totals can be
checked.

Scope is enforced on exports by the same code that enforces it on the page, so
an export can never reach a class the person is not allowed to see. A parent
requesting an export gets 403, and that is a test, not an intention.

### 9. Student profiles

Every student has a page: attendance history, observations, and a 30 / 90 / 365
day window. Staff reach it from the student list, parents from their dashboard.
A parent can only ever open their own child. A teacher can only open students of
the classes assigned to them. Both are tested.

### 10. The audit trail

`/audit`, administrator only, append-only. Every mutation writes a line: who,
what, which entity, when, and a human-readable summary.

The actor's **name is copied into the row**, not just their id — so history
stays readable after an account is deleted. Filterable by entity and by person.

### 11. Arabic and English

The interface **opens in Arabic**, right-to-left, with English one click away.
The choice lives in a cookie, so no route is duplicated and no URL changes.

Dates follow the language: Arabic uses `ar-EG` with Latin digits, because
Eastern Arabic numerals beside the Latin figures in the tables read badly.

A missing translation falls back to English rather than showing a raw key — the
failure mode you want in front of a parent. A test enforces that the two
dictionaries stay in step, so a new key cannot ship half-translated.

## What it deliberately does not do

Saying no is a design decision, and these were made on purpose:

- **No grading or marks.** A different product with different stakeholders.
- **No messaging or notifications.** Email and SMS are an operational burden
  (deliverability, opt-outs, cost) that a first release does not need.
- **No timetable solver.** The school day is a flat list of periods applied to
  every day. That covers the common case; per-day timetables are a known,
  deliberate limitation ([06 — Status](06-status.md)).
- **No mobile app.** The interface is responsive and works on a phone browser.
- **No multi-school tenancy.** One deployment serves one school. Multi-tenancy
  changes every query and every access check; it is not retrofitted casually.

## How it was built

Written with Claude (Anthropic) as the implementing engineer, on a
verify-before-claiming discipline:

1. **Read the whole surface first.** Schema, access model, existing tests —
   before touching anything.
2. **Decide the ambiguous things explicitly**, with the owner, and record the
   decision. Timezone, whether periods vary per weekday, who may correct a
   closed register: all asked, none guessed.
3. **Put each rule in one place.** The period write rule is one function that
   both the page and the server action call, so they cannot drift.
4. **Test the rule, not the happy path.** The suites assert what is *refused*:
   a teacher cannot back-date, a parent cannot export, a supervisor cannot reach
   another class.
5. **Trust nothing that has not run.** Every claim of "green" in these documents
   is quoted test output.

That last point earned its place. While building the period feature, the test
suite was found to be scoring **every blocked page as passing** — it judged
"was this refused?" by HTTP status, and the dev server answers a refusal with
200. Four access-control checks had been silently failing. The harness now
checks what the page actually shows. See
[06 — Status](06-status.md#defects-found-and-fixed).
