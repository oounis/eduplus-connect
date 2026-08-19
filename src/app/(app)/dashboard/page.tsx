import Link from "next/link";
import { requireModule, isSchoolWide } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDate, formatShortDate, today, toISODate } from "@/lib/dates";
import {
  getAttendanceSummaryForDay,
  getCurrentYear,
  getObservationSummaryForWeek,
  getVisibleClassIds,
} from "@/lib/queries";
import {
  AttendanceBadge,
  AttendanceBar,
  Card,
  EmptyState,
  PageHeader,
  SentimentBadge,
  StatTile,
} from "@/components/ui";
import { OBSERVATION_CATEGORY_LABELS, ROLE_LABELS } from "@/lib/constants";

export default async function DashboardPage() {
  const user = await requireModule("dashboard");
  const day = today();

  if (user.role === "PARENT" || user.role === "STUDENT") {
    return <FamilyDashboard userId={user.userId} role={user.role} />;
  }

  const classIds = await getVisibleClassIds(user);
  const year = await getCurrentYear();
  const [attendance, observations] = await Promise.all([
    getAttendanceSummaryForDay(day, classIds),
    getObservationSummaryForWeek(day, classIds),
  ]);

  const totals = attendance.reduce(
    (acc, row) => ({
      enrolled: acc.enrolled + row.enrolled,
      present: acc.present + row.present,
      absent: acc.absent + row.absent,
      late: acc.late + row.late,
      excused: acc.excused + row.excused,
      recorded: acc.recorded + row.recorded,
      taken: acc.taken + (row.taken ? 1 : 0),
    }),
    { enrolled: 0, present: 0, absent: 0, late: 0, excused: 0, recorded: 0, taken: 0 },
  );
  const rate =
    totals.recorded > 0
      ? ((totals.present + totals.late) / totals.recorded) * 100
      : null;

  const obsTotals = observations.rows.reduce(
    (acc, row) => ({
      total: acc.total + row.total,
      positive: acc.positive + row.positive,
      concern: acc.concern + row.concern,
    }),
    { total: 0, positive: 0, concern: 0 },
  );

  const scope = isSchoolWide(user.role)
    ? "all classes"
    : `your ${attendance.length} assigned ${attendance.length === 1 ? "class" : "classes"}`;

  return (
    <>
      <PageHeader
        title={`Good day, ${user.name.split(" ")[0]}`}
        description={`${ROLE_LABELS[user.role]} · ${formatDate(day)} · ${year?.name ?? "no academic year"} · ${scope}`}
      />

      {/* Today's attendance ------------------------------------------------ */}
      <section className="mb-8">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-500">
            Attendance — today
          </h2>
          <Link
            href={`/attendance?date=${toISODate(day)}`}
            className="text-xs font-medium text-brand-600 hover:underline"
          >
            Open register →
          </Link>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <StatTile
            label="Attendance rate"
            value={rate === null ? "—" : `${rate.toFixed(1)}%`}
            hint={`${totals.recorded} of ${totals.enrolled} students recorded`}
            tone={rate === null ? "neutral" : rate >= 90 ? "positive" : "warning"}
          />
          <StatTile label="Present" value={totals.present} tone="positive" />
          <StatTile label="Absent" value={totals.absent} tone="danger" />
          <StatTile label="Late" value={totals.late} tone="warning" />
          <StatTile
            label="Registers taken"
            value={`${totals.taken}/${attendance.length}`}
            hint={
              totals.taken < attendance.length
                ? `${attendance.length - totals.taken} still pending`
                : "All classes complete"
            }
            tone={totals.taken < attendance.length ? "warning" : "positive"}
          />
        </div>

        <Card className="mt-4" title="By class" subtitle={formatDate(day)}>
          {attendance.length === 0 ? (
            <EmptyState>No classes are assigned to you yet.</EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Class</th>
                    <th className="w-48">Breakdown</th>
                    <th className="text-right">Present</th>
                    <th className="text-right">Absent</th>
                    <th className="text-right">Late</th>
                    <th className="text-right">Excused</th>
                    <th className="text-right">Rate</th>
                    <th className="text-right">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {attendance.map((row) => (
                    <tr key={row.classId}>
                      <td>
                        <Link
                          href={`/attendance?classId=${row.classId}&date=${toISODate(day)}`}
                          className="font-medium text-ink-900 hover:text-brand-600"
                        >
                          {row.className}
                        </Link>
                        <span className="ml-2 text-xs text-ink-400">
                          {row.enrolled} students
                        </span>
                      </td>
                      <td>
                        <AttendanceBar
                          present={row.present}
                          absent={row.absent}
                          late={row.late}
                          excused={row.excused}
                        />
                      </td>
                      <td className="text-right tabular-nums">{row.present}</td>
                      <td className="text-right tabular-nums">
                        {row.absent > 0 ? (
                          <span className="font-medium text-red-600">
                            {row.absent}
                          </span>
                        ) : (
                          0
                        )}
                      </td>
                      <td className="text-right tabular-nums">{row.late}</td>
                      <td className="text-right tabular-nums">{row.excused}</td>
                      <td className="text-right tabular-nums">
                        {row.rate === null ? "—" : `${row.rate.toFixed(0)}%`}
                      </td>
                      <td className="text-right">
                        {row.taken ? (
                          <span className="badge bg-emerald-50 text-emerald-700">
                            Taken
                          </span>
                        ) : (
                          <span className="badge bg-amber-50 text-amber-700">
                            Not taken
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </section>

      {/* This week's observations ------------------------------------------ */}
      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-500">
            Observations — this week
          </h2>
          <Link
            href="/observations"
            className="text-xs font-medium text-brand-600 hover:underline"
          >
            Open observations →
          </Link>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            label="Observations logged"
            value={obsTotals.total}
            hint={`${formatShortDate(observations.from)} – ${formatShortDate(observations.to)}`}
            tone="brand"
          />
          <StatTile label="Positive" value={obsTotals.positive} tone="positive" />
          <StatTile label="Concerns" value={obsTotals.concern} tone="danger" />
          <StatTile
            label="Classes with entries"
            value={`${observations.rows.filter((r) => r.total > 0).length}/${observations.rows.length}`}
          />
        </div>

        <Card
          className="mt-4"
          title="By class"
          subtitle={`Week of ${formatDate(observations.from)}`}
        >
          {observations.rows.length === 0 ? (
            <EmptyState>No classes are assigned to you yet.</EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Class</th>
                    <th className="text-right">Total</th>
                    <th className="text-right">Positive</th>
                    <th className="text-right">Neutral</th>
                    <th className="text-right">Concern</th>
                    <th className="text-right">Students covered</th>
                  </tr>
                </thead>
                <tbody>
                  {observations.rows.map((row) => (
                    <tr key={row.classId}>
                      <td>
                        <Link
                          href={`/observations?classId=${row.classId}`}
                          className="font-medium text-ink-900 hover:text-brand-600"
                        >
                          {row.className}
                        </Link>
                      </td>
                      <td className="text-right font-medium tabular-nums">
                        {row.total}
                      </td>
                      <td className="text-right tabular-nums text-emerald-600">
                        {row.positive}
                      </td>
                      <td className="text-right tabular-nums">{row.neutral}</td>
                      <td className="text-right tabular-nums">
                        {row.concern > 0 ? (
                          <span className="font-medium text-red-600">
                            {row.concern}
                          </span>
                        ) : (
                          0
                        )}
                      </td>
                      <td className="text-right tabular-nums text-ink-500">
                        {row.studentsCovered}/{row.enrolled}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </section>
    </>
  );
}

/** Parents and students see only their own records. */
async function FamilyDashboard({
  userId,
  role,
}: {
  userId: string;
  role: string;
}) {
  const students = await prisma.student.findMany({
    where: role === "PARENT" ? { parentId: userId } : { userId },
    include: { class: true },
    orderBy: { firstName: "asc" },
  });

  const day = today();
  const weekStart = new Date(day);
  weekStart.setUTCDate(weekStart.getUTCDate() - 30);

  const ids = students.map((s) => s.id);
  const [attendance, observations] = await Promise.all([
    prisma.attendance.findMany({
      where: { studentId: { in: ids }, date: { gte: weekStart } },
      orderBy: { date: "desc" },
      take: 30,
      include: { student: true },
    }),
    prisma.observation.findMany({
      where: { studentId: { in: ids }, date: { gte: weekStart } },
      orderBy: { date: "desc" },
      take: 30,
      include: { student: true, author: true },
    }),
  ]);

  return (
    <>
      <PageHeader
        title={role === "PARENT" ? "My children" : "My record"}
        description={`${formatDate(day)} · attendance and observations from the last 30 days`}
      />

      {students.length === 0 ? (
        <Card>
          <EmptyState>
            No student record is linked to this account yet.
          </EmptyState>
        </Card>
      ) : (
        <>
          <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {students.map((student) => {
              const own = attendance.filter((a) => a.studentId === student.id);
              const absences = own.filter((a) => a.status === "ABSENT").length;
              const concerns = observations.filter(
                (o) => o.studentId === student.id && o.sentiment === "CONCERN",
              ).length;
              return (
                <div key={student.id} className="card px-5 py-4">
                  <p className="font-medium text-ink-900">
                    {student.firstName} {student.lastName}
                  </p>
                  <p className="text-xs text-ink-500">
                    {student.class?.name ?? "Unassigned"} · {student.code}
                  </p>
                  <div className="mt-3 flex gap-6 text-sm">
                    <div>
                      <p className="text-xs text-ink-500">Absences (30d)</p>
                      <p className="font-semibold tabular-nums">{absences}</p>
                    </div>
                    <div>
                      <p className="text-xs text-ink-500">Concerns (30d)</p>
                      <p className="font-semibold tabular-nums">{concerns}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Recent attendance">
              {attendance.length === 0 ? (
                <EmptyState>No attendance recorded yet.</EmptyState>
              ) : (
                <div className="overflow-x-auto">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Student</th>
                        <th className="text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attendance.slice(0, 12).map((row) => (
                        <tr key={row.id}>
                          <td className="whitespace-nowrap text-ink-500">
                            {formatShortDate(row.date)}
                          </td>
                          <td>{row.student.firstName}</td>
                          <td className="text-right">
                            <AttendanceBadge status={row.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            <Card title="Recent observations">
              {observations.length === 0 ? (
                <EmptyState>No observations recorded yet.</EmptyState>
              ) : (
                <ul className="divide-y divide-ink-100">
                  {observations.slice(0, 8).map((row) => (
                    <li key={row.id} className="px-5 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs text-ink-500">
                          {formatShortDate(row.date)} ·{" "}
                          {
                            OBSERVATION_CATEGORY_LABELS[
                              row.category as keyof typeof OBSERVATION_CATEGORY_LABELS
                            ]
                          }
                        </span>
                        <SentimentBadge sentiment={row.sentiment} />
                      </div>
                      <p className="mt-1 text-sm text-ink-800">{row.note}</p>
                      <p className="mt-0.5 text-xs text-ink-400">
                        {row.student.firstName} · {row.author.firstName}{" "}
                        {row.author.lastName}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}
    </>
  );
}
