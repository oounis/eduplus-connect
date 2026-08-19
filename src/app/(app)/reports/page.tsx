import Link from "next/link";
import { requireModule, isSchoolWide } from "@/lib/auth";
import { resolveReportScope } from "@/lib/reports";
import {
  getClassReport,
  getDailyTrend,
  getObservationMatrix,
  getStudentReport,
} from "@/lib/queries";
import { formatDate, formatShortDate } from "@/lib/dates";
import {
  AttendanceBar,
  Card,
  EmptyState,
  PageHeader,
  StatTile,
} from "@/components/ui";
import {
  OBSERVATION_CATEGORIES,
  OBSERVATION_CATEGORY_LABELS,
  SENTIMENTS,
  SENTIMENT_LABELS,
} from "@/lib/constants";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; classId?: string }>;
}) {
  const user = await requireModule("reports");
  const scope = await resolveReportScope(user, await searchParams);

  const [classRows, studentRows, matrix, trend] = await Promise.all([
    getClassReport(scope, scope.classIds),
    getStudentReport(scope, scope.classIds),
    getObservationMatrix(scope, scope.classIds),
    getDailyTrend(scope, scope.classIds),
  ]);

  const totals = classRows.reduce(
    (acc, row) => ({
      present: acc.present + row.present,
      absent: acc.absent + row.absent,
      late: acc.late + row.late,
      excused: acc.excused + row.excused,
      recorded: acc.recorded + row.recorded,
      observations: acc.observations + row.observations,
      concerns: acc.concerns + row.concerns,
    }),
    {
      present: 0,
      absent: 0,
      late: 0,
      excused: 0,
      recorded: 0,
      observations: 0,
      concerns: 0,
    },
  );
  const rate =
    totals.recorded > 0
      ? ((totals.present + totals.late) / totals.recorded) * 100
      : null;

  const query = `from=${scope.fromISO}&to=${scope.toISO}${
    scope.selectedClassId ? `&classId=${scope.selectedClassId}` : ""
  }`;

  const matrixCount = (category: string, sentiment: string) =>
    matrix.find((m) => m.category === category && m.sentiment === sentiment)
      ?._count._all ?? 0;

  const perfect = studentRows.filter(
    (s) => s.recorded > 0 && s.absent === 0 && s.late === 0,
  ).length;

  return (
    <>
      <PageHeader
        title="Reports"
        description={`${formatDate(scope.from)} – ${formatDate(scope.to)} · ${
          scope.selectedClassId
            ? scope.classes.find((c) => c.id === scope.selectedClassId)?.name
            : isSchoolWide(user.role)
              ? "all classes"
              : "your assigned classes"
        }`}
      />

      {/* Filters ------------------------------------------------------------ */}
      <form className="mb-6 flex flex-wrap items-end gap-3" action="/reports">
        <div>
          <label className="label" htmlFor="from">From</label>
          <input
            id="from"
            name="from"
            type="date"
            className="input w-44"
            defaultValue={scope.fromISO}
          />
        </div>
        <div>
          <label className="label" htmlFor="to">To</label>
          <input
            id="to"
            name="to"
            type="date"
            className="input w-44"
            defaultValue={scope.toISO}
          />
        </div>
        <div>
          <label className="label" htmlFor="classId">Class</label>
          <select
            id="classId"
            name="classId"
            className="select w-56"
            defaultValue={scope.selectedClassId ?? ""}
          >
            <option value="">All my classes</option>
            {scope.classes.map((klass) => (
              <option key={klass.id} value={klass.id}>{klass.name}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-secondary">Apply</button>
        <Link href="/reports" className="btn-secondary">Reset</Link>
      </form>

      {scope.classes.length === 0 ? (
        <Card>
          <EmptyState>
            No classes are available to you, so there is nothing to report on.
          </EmptyState>
        </Card>
      ) : (
        <>
          <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <StatTile
              label="Attendance rate"
              value={rate === null ? "—" : `${rate.toFixed(1)}%`}
              hint={`${totals.recorded} records`}
              tone={rate === null ? "neutral" : rate >= 90 ? "positive" : "warning"}
            />
            <StatTile label="Absences" value={totals.absent} tone="danger" />
            <StatTile label="Late" value={totals.late} tone="warning" />
            <StatTile
              label="Observations"
              value={totals.observations}
              hint={`${totals.concerns} concerns`}
              tone="brand"
            />
            <StatTile
              label="Perfect attendance"
              value={perfect}
              hint={`of ${studentRows.length} students`}
              tone="positive"
            />
          </div>

          {/* By class ------------------------------------------------------- */}
          <Card
            className="mb-6"
            title="By class"
            subtitle={`${classRows.length} ${classRows.length === 1 ? "class" : "classes"}`}
            actions={
              <a
                href={`/reports/export?type=classes&${query}`}
                className="btn-secondary btn-sm"
              >
                Export CSV
              </a>
            }
          >
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Class</th>
                    <th className="text-right">Students</th>
                    <th className="text-right">Days taken</th>
                    <th className="w-40">Breakdown</th>
                    <th className="text-right">Present</th>
                    <th className="text-right">Absent</th>
                    <th className="text-right">Late</th>
                    <th className="text-right">Rate</th>
                    <th className="text-right">Observations</th>
                    <th className="text-right">Concerns</th>
                  </tr>
                </thead>
                <tbody>
                  {classRows.map((row) => (
                    <tr key={row.classId}>
                      <td>
                        <Link
                          href={`/reports?${query.replace(/&classId=[^&]*/, "")}&classId=${row.classId}`}
                          className="font-medium text-ink-900 hover:text-brand-600"
                        >
                          {row.className}
                        </Link>
                      </td>
                      <td className="text-right tabular-nums">{row.enrolled}</td>
                      <td className="text-right tabular-nums">{row.daysRecorded}</td>
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
                          <span className="font-medium text-red-600">{row.absent}</span>
                        ) : (
                          0
                        )}
                      </td>
                      <td className="text-right tabular-nums">{row.late}</td>
                      <td className="text-right tabular-nums">
                        {row.rate === null ? "—" : `${row.rate.toFixed(0)}%`}
                      </td>
                      <td className="text-right tabular-nums">{row.observations}</td>
                      <td className="text-right tabular-nums">
                        {row.concerns > 0 ? (
                          <span className="font-medium text-red-600">{row.concerns}</span>
                        ) : (
                          0
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Students needing attention ------------------------------------- */}
          <Card
            className="mb-6"
            title="Students by absence"
            subtitle="Most absences first"
            actions={
              <a
                href={`/reports/export?type=students&${query}`}
                className="btn-secondary btn-sm"
              >
                Export CSV
              </a>
            }
          >
            {studentRows.length === 0 ? (
              <EmptyState>No students in this scope.</EmptyState>
            ) : (
              <div className="max-h-[32rem] overflow-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Class</th>
                      <th className="text-right">Recorded</th>
                      <th className="text-right">Absent</th>
                      <th className="text-right">Late</th>
                      <th className="text-right">Excused</th>
                      <th className="text-right">Rate</th>
                      <th className="text-right">Concerns</th>
                    </tr>
                  </thead>
                  <tbody>
                    {studentRows.slice(0, 50).map((row) => (
                      <tr key={row.studentId}>
                        <td>
                          <Link
                            href={`/students/${row.studentId}`}
                            className="font-medium text-ink-900 hover:text-brand-600"
                          >
                            {row.name}
                          </Link>
                          <span className="ml-2 font-mono text-xs text-ink-400">
                            {row.code}
                          </span>
                        </td>
                        <td className="text-ink-600">{row.className}</td>
                        <td className="text-right tabular-nums">{row.recorded}</td>
                        <td className="text-right tabular-nums">
                          {row.absent > 0 ? (
                            <span className="font-medium text-red-600">{row.absent}</span>
                          ) : (
                            0
                          )}
                        </td>
                        <td className="text-right tabular-nums">{row.late}</td>
                        <td className="text-right tabular-nums">{row.excused}</td>
                        <td className="text-right tabular-nums">
                          {row.rate === null ? "—" : `${row.rate.toFixed(0)}%`}
                        </td>
                        <td className="text-right tabular-nums">{row.concerns}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {studentRows.length > 50 && (
                  <p className="px-5 py-3 text-xs text-ink-500">
                    Showing the 50 students with the most absences of{" "}
                    {studentRows.length}. The CSV export contains every student.
                  </p>
                )}
              </div>
            )}
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Observation matrix ------------------------------------------ */}
            <Card
              title="Observations by category"
              subtitle="Category against sentiment"
              actions={
                <a
                  href={`/reports/export?type=observations&${query}`}
                  className="btn-secondary btn-sm"
                >
                  Export CSV
                </a>
              }
            >
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Category</th>
                      {SENTIMENTS.map((s) => (
                        <th key={s} className="text-right">{SENTIMENT_LABELS[s]}</th>
                      ))}
                      <th className="text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {OBSERVATION_CATEGORIES.map((category) => {
                      const cells = SENTIMENTS.map((s) => matrixCount(category, s));
                      const total = cells.reduce((a, b) => a + b, 0);
                      return (
                        <tr key={category}>
                          <td className="font-medium text-ink-800">
                            {OBSERVATION_CATEGORY_LABELS[category]}
                          </td>
                          {cells.map((n, i) => (
                            <td key={SENTIMENTS[i]} className="text-right tabular-nums">
                              {SENTIMENTS[i] === "CONCERN" && n > 0 ? (
                                <span className="font-medium text-red-600">{n}</span>
                              ) : (
                                n
                              )}
                            </td>
                          ))}
                          <td className="text-right font-medium tabular-nums">{total}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Daily trend -------------------------------------------------- */}
            <Card title="Daily attendance" subtitle={`${trend.length} school days recorded`}>
              {trend.length === 0 ? (
                <EmptyState>No attendance was recorded in this period.</EmptyState>
              ) : (
                <div className="max-h-[24rem] overflow-y-auto px-5 py-3">
                  <ul className="space-y-2">
                    {trend.map((day) => (
                      <li key={day.date.toISOString()} className="flex items-center gap-3">
                        <span className="w-16 shrink-0 text-xs text-ink-500">
                          {formatShortDate(day.date)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <AttendanceBar
                            present={day.present}
                            absent={day.absent}
                            late={day.late}
                            excused={day.excused}
                          />
                        </div>
                        <span className="w-12 shrink-0 text-right text-xs tabular-nums text-ink-600">
                          {day.rate === null ? "—" : `${day.rate.toFixed(0)}%`}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          </div>
        </>
      )}
    </>
  );
}
