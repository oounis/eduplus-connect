import Link from "next/link";
import { requireModule } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDate, toDayKey, today, toISODate } from "@/lib/dates";
import {
  getAttendanceSummaryForDay,
  getCurrentYear,
  getVisibleClassIds,
} from "@/lib/queries";
import { AttendanceBar, Card, EmptyState, PageHeader, StatTile } from "@/components/ui";
import Register, { type RegisterStudent } from "./register";
import type { AttendanceStatus } from "@/lib/constants";

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ classId?: string; date?: string }>;
}) {
  const user = await requireModule("attendance");
  const params = await searchParams;

  const year = await getCurrentYear();
  const visible = await getVisibleClassIds(user);

  const classes = year
    ? await prisma.class.findMany({
        where: {
          academicYearId: year.id,
          ...(visible === "ALL" ? {} : { id: { in: visible } }),
        },
        orderBy: { name: "asc" },
      })
    : [];

  // Default to the first class the user can see, and to today.
  const selectedClassId =
    params.classId && classes.some((c) => c.id === params.classId)
      ? params.classId
      : classes[0]?.id;
  const dateParam = params.date ?? toISODate(today());
  const date = toDayKey(dateParam);
  const isFuture = date.getTime() > today().getTime();

  // Supervisors write their own classes; admin/deputy can edit any.
  const isOwnClass =
    user.role === "ADMIN" ||
    user.role === "DEPUTY" ||
    (visible !== "ALL" && selectedClassId
      ? visible.includes(selectedClassId)
      : false);
  const canWrite =
    user.access.attendance.edit && isOwnClass && !isFuture && Boolean(selectedClassId);

  const summary = await getAttendanceSummaryForDay(
    date,
    classes.map((c) => c.id),
  );

  let students: RegisterStudent[] = [];
  if (selectedClassId) {
    const [roster, existing] = await Promise.all([
      prisma.student.findMany({
        where: { classId: selectedClassId, isActive: true },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      }),
      prisma.attendance.findMany({
        where: { classId: selectedClassId, date },
      }),
    ]);
    const byStudent = new Map(existing.map((row) => [row.studentId, row]));
    students = roster.map((student) => {
      const record = byStudent.get(student.id);
      return {
        id: student.id,
        code: student.code,
        firstName: student.firstName,
        lastName: student.lastName,
        status: (record?.status as AttendanceStatus) ?? null,
        note: record?.note ?? "",
      };
    });
  }

  const dayTotals = summary.reduce(
    (acc, row) => ({
      present: acc.present + row.present,
      absent: acc.absent + row.absent,
      late: acc.late + row.late,
      excused: acc.excused + row.excused,
    }),
    { present: 0, absent: 0, late: 0, excused: 0 },
  );
  const recorded =
    dayTotals.present + dayTotals.absent + dayTotals.late + dayTotals.excused;

  return (
    <>
      <PageHeader
        title="Attendance"
        description={`${formatDate(date)} · ${
          visible === "ALL" ? "all classes" : "your assigned classes"
        }`}
      />

      {/* Class + date picker */}
      <form className="mb-6 flex flex-wrap items-end gap-3" action="/attendance">
        <div>
          <label className="label" htmlFor="classId">Class</label>
          <select
            id="classId"
            name="classId"
            className="select w-56"
            defaultValue={selectedClassId ?? ""}
          >
            {classes.length === 0 && <option value="">No classes available</option>}
            {classes.map((klass) => (
              <option key={klass.id} value={klass.id}>{klass.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="date">Date</label>
          <input
            id="date"
            name="date"
            type="date"
            className="input w-44"
            defaultValue={dateParam}
            max={toISODate(today())}
          />
        </div>
        <button type="submit" className="btn-secondary">Open register</button>
      </form>

      {classes.length === 0 ? (
        <Card>
          <EmptyState>
            No classes are available to you. An administrator assigns classes
            under Assignments.
          </EmptyState>
        </Card>
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile
              label="Recorded today"
              value={recorded}
              hint={`across ${summary.length} ${summary.length === 1 ? "class" : "classes"}`}
            />
            <StatTile label="Present" value={dayTotals.present} tone="positive" />
            <StatTile label="Absent" value={dayTotals.absent} tone="danger" />
            <StatTile label="Late" value={dayTotals.late} tone="warning" />
          </div>

          {isFuture && (
            <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-900">
              You cannot take a register for a future date.
            </div>
          )}
          {!isOwnClass && !isFuture && (
            <div className="mb-5 rounded-xl border border-ink-200 bg-white px-5 py-3 text-sm text-ink-600">
              You are viewing this register read-only — you are not the
              supervisor of this class.
            </div>
          )}

          <div className="mb-6">
            {students.length === 0 ? (
              <Card>
                <EmptyState>This class has no active students.</EmptyState>
              </Card>
            ) : (
              <Register
                classId={selectedClassId!}
                date={dateParam}
                students={students}
                readOnly={!canWrite}
              />
            )}
          </div>

          <Card title="All classes on this date" subtitle={formatDate(date)}>
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Class</th>
                    <th className="w-48">Breakdown</th>
                    <th className="text-end">Present</th>
                    <th className="text-end">Absent</th>
                    <th className="text-end">Late</th>
                    <th className="text-end">Excused</th>
                    <th className="text-end">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.map((row) => (
                    <tr key={row.classId}>
                      <td>
                        <Link
                          href={`/attendance?classId=${row.classId}&date=${dateParam}`}
                          className="font-medium text-ink-900 hover:text-brand-600"
                        >
                          {row.className}
                        </Link>
                      </td>
                      <td>
                        <AttendanceBar
                          present={row.present}
                          absent={row.absent}
                          late={row.late}
                          excused={row.excused}
                        />
                      </td>
                      <td className="text-end tabular-nums">{row.present}</td>
                      <td className="text-end tabular-nums">{row.absent}</td>
                      <td className="text-end tabular-nums">{row.late}</td>
                      <td className="text-end tabular-nums">{row.excused}</td>
                      <td className="text-end">
                        {row.taken ? (
                          <span className="badge bg-emerald-50 text-emerald-700">Taken</span>
                        ) : (
                          <span className="badge bg-amber-50 text-amber-700">Not taken</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </>
  );
}
