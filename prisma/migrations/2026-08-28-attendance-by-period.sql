-- Attendance by period — adds the school-day timetable and the per-period
-- register. Nothing existing is altered: the supervisor's daily `Attendance`
-- table and every row in it are untouched.
--
-- Apply to the hosted (Turso) database with:
--
--   TURSO_DATABASE_URL=… TURSO_AUTH_TOKEN=… \
--     npm run db:remote prisma/migrations/2026-08-28-attendance-by-period.sql
--
-- Then grant the three new modules on the existing database:
--
--   TURSO_DATABASE_URL=… TURSO_AUTH_TOKEN=… npm run db:sync-access
--
-- `prisma migrate diff --from-url` cannot read a libsql:// URL, so this file is
-- the DDL Prisma generated locally rather than a diff against production.

CREATE TABLE "Period" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "PeriodAttendance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "status" TEXT NOT NULL,
    "note" TEXT,
    "periodId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "recordedById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PeriodAttendance_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "Period" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PeriodAttendance_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PeriodAttendance_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PeriodAttendance_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Period_name_key" ON "Period"("name");
CREATE INDEX "Period_startTime_idx" ON "Period"("startTime");

CREATE UNIQUE INDEX "PeriodAttendance_studentId_date_periodId_key" ON "PeriodAttendance"("studentId", "date", "periodId");
CREATE INDEX "PeriodAttendance_classId_date_periodId_idx" ON "PeriodAttendance"("classId", "date", "periodId");
CREATE INDEX "PeriodAttendance_date_periodId_idx" ON "PeriodAttendance"("date", "periodId");
CREATE INDEX "PeriodAttendance_studentId_idx" ON "PeriodAttendance"("studentId");
