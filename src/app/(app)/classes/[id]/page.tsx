import Link from "next/link";
import { notFound } from "next/navigation";
import { requireModule } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatShortDate, today, toISODate } from "@/lib/dates";
import { getAttendanceSummaryForDay, getObservationSummaryForWeek } from "@/lib/queries";
import {
  AttendanceBar,
  Card,
  EmptyState,
  PageHeader,
  SentimentBadge,
  StatTile,
} from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { deleteClass, updateClass } from "../actions";

export default async function ClassDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireModule("classes");
  const { id } = await params;
  const canEdit = user.access.classes.edit;

  const klass = await prisma.class.findUnique({
    where: { id },
    include: {
      academicYear: true,
      students: { orderBy: [{ lastName: "asc" }, { firstName: "asc" }] },
      supervisors: { include: { user: true } },
      teachers: { include: { user: true } },
    },
  });
  if (!klass) notFound();

  const day = today();
  const [attendance, observations, years, recentObservations] = await Promise.all([
    getAttendanceSummaryForDay(day, [klass.id]),
    getObservationSummaryForWeek(day, [klass.id]),
    prisma.academicYear.findMany({ orderBy: { startDate: "desc" } }),
    prisma.observation.findMany({
      where: { classId: klass.id },
      orderBy: { date: "desc" },
      take: 8,
      include: { student: true, author: true },
    }),
  ]);
  const attendanceToday = attendance[0];
  const observationsWeek = observations.rows[0];

  return (
    <>
      <PageHeader
        title={klass.name}
        description={`${klass.level} · ${klass.academicYear.name} · room ${klass.room ?? "—"}`}
        actions={
          <>
            <Link
              href={`/attendance?classId=${klass.id}&date=${toISODate(day)}`}
              className="btn-secondary btn-sm"
            >
              Attendance
            </Link>
            <Link href={`/observations?classId=${klass.id}`} className="btn-secondary btn-sm">
              Observations
            </Link>
            <Link href="/classes" className="btn-secondary btn-sm">
              Back
            </Link>
          </>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Students" value={klass.students.length} hint={`Capacity ${klass.capacity}`} />
        <StatTile
          label="Attendance today"
          value={attendanceToday?.rate === null || !attendanceToday ? "—" : `${attendanceToday.rate.toFixed(0)}%`}
          hint={attendanceToday?.taken ? `${attendanceToday.recorded} recorded` : "Register not taken"}
          tone={attendanceToday?.taken ? "positive" : "warning"}
        />
        <StatTile
          label="Observations this week"
          value={observationsWeek?.total ?? 0}
          hint={`${observationsWeek?.concern ?? 0} concerns`}
          tone="brand"
        />
        <StatTile
          label="Staff assigned"
          value={klass.supervisors.length + klass.teachers.length}
          hint={`${klass.supervisors.length} supervisor · ${klass.teachers.length} teacher`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card title="Students" subtitle={`${klass.students.length} enrolled`}>
            {klass.students.length === 0 ? (
              <EmptyState>No students in this class yet.</EmptyState>
            ) : (
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>Name</th>
                      <th className="text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {klass.students.map((student) => (
                      <tr key={student.id}>
                        <td className="font-mono text-xs text-ink-500">{student.code}</td>
                        <td className="font-medium text-ink-900">
                          {student.lastName}, {student.firstName}
                        </td>
                        <td className="text-right">
                          {student.isActive ? (
                            <span className="badge bg-emerald-50 text-emerald-700">Active</span>
                          ) : (
                            <span className="badge bg-ink-100 text-ink-500">Inactive</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card title="Latest observations">
            {recentObservations.length === 0 ? (
              <EmptyState>No observations recorded for this class.</EmptyState>
            ) : (
              <ul className="divide-y divide-ink-100">
                {recentObservations.map((row) => (
                  <li key={row.id} className="px-5 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium text-ink-900">
                        {row.student.firstName} {row.student.lastName}
                      </span>
                      <SentimentBadge sentiment={row.sentiment} />
                    </div>
                    <p className="mt-1 text-sm text-ink-700">{row.note}</p>
                    <p className="mt-0.5 text-xs text-ink-400">
                      {formatShortDate(row.date)} · {row.author.firstName} {row.author.lastName}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          {attendanceToday && (
            <Card title="Today's register">
              <div className="px-5 py-4">
                <AttendanceBar
                  present={attendanceToday.present}
                  absent={attendanceToday.absent}
                  late={attendanceToday.late}
                  excused={attendanceToday.excused}
                />
                <dl className="mt-4 space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-ink-500">Present</dt>
                    <dd className="tabular-nums">{attendanceToday.present}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-ink-500">Late</dt>
                    <dd className="tabular-nums">{attendanceToday.late}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-ink-500">Excused</dt>
                    <dd className="tabular-nums">{attendanceToday.excused}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-ink-500">Absent</dt>
                    <dd className="tabular-nums font-medium text-red-600">
                      {attendanceToday.absent}
                    </dd>
                  </div>
                </dl>
              </div>
            </Card>
          )}

          <Card title="Assigned staff">
            <div className="space-y-3 px-5 py-4 text-sm">
              <div>
                <p className="label">Supervisors</p>
                {klass.supervisors.length === 0 ? (
                  <p className="text-ink-500">None assigned.</p>
                ) : (
                  <ul className="space-y-0.5">
                    {klass.supervisors.map((s) => (
                      <li key={s.id} className="text-ink-700">
                        {s.user.firstName} {s.user.lastName}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <p className="label">Teachers</p>
                {klass.teachers.length === 0 ? (
                  <p className="text-ink-500">None assigned.</p>
                ) : (
                  <ul className="space-y-0.5">
                    {klass.teachers.map((t) => (
                      <li key={t.id} className="text-ink-700">
                        {t.user.firstName} {t.user.lastName}
                        {t.subject && (
                          <span className="text-ink-400"> · {t.subject}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </Card>

          {canEdit && (
            <Card title="Edit class">
              <div className="px-5 py-4">
                <ActionForm action={updateClass} submitLabel="Save changes">
                  <input type="hidden" name="id" value={klass.id} />
                  <div className="space-y-3">
                    <div>
                      <label className="label" htmlFor="name">Name</label>
                      <input id="name" name="name" className="input" defaultValue={klass.name} required />
                    </div>
                    <div>
                      <label className="label" htmlFor="level">Level</label>
                      <input id="level" name="level" className="input" defaultValue={klass.level} required />
                    </div>
                    <div>
                      <label className="label" htmlFor="room">Room</label>
                      <input id="room" name="room" className="input" defaultValue={klass.room ?? ""} />
                    </div>
                    <div>
                      <label className="label" htmlFor="capacity">Capacity</label>
                      <input
                        id="capacity"
                        name="capacity"
                        type="number"
                        min={1}
                        max={200}
                        className="input"
                        defaultValue={klass.capacity}
                        required
                      />
                    </div>
                    <div>
                      <label className="label" htmlFor="academicYearId">Academic year</label>
                      <select
                        id="academicYearId"
                        name="academicYearId"
                        className="select"
                        defaultValue={klass.academicYearId}
                      >
                        {years.map((y) => (
                          <option key={y.id} value={y.id}>{y.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </ActionForm>

                {klass.students.length === 0 && (
                  <form action={deleteClass} className="mt-4 border-t border-ink-100 pt-4">
                    <input type="hidden" name="id" value={klass.id} />
                    <button type="submit" className="btn-danger btn-sm">
                      Delete this class
                    </button>
                  </form>
                )}
              </div>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
