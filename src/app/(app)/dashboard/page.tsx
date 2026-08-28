import Link from "next/link";
import { getI18n, getT } from "@/lib/locale";
import { requireModule, isSchoolWide } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDate, formatShortDate, today, toISODate } from "@/lib/dates";
import {
  getAttendanceSummaryForDay,
  getCurrentYear,
  getObservationSummaryForWeek,
  getVisibleClassIds,
} from "@/lib/queries";
import { getPeriods } from "@/lib/periods";
import { findLivePeriod, findNextPeriod, schoolClock } from "@/lib/school-time";
import {
  AttendanceBadge,
  AttendanceBar,
  Card,
  EmptyState,
  PageHeader,
  SentimentBadge,
  StatTile,
} from "@/components/ui";
import { OBSERVATION_CATEGORY_LABELS } from "@/lib/constants";

export default async function DashboardPage() {
  const { locale, t } = await getI18n();
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
    ? t("dash.allClasses")
    : `your ${attendance.length} assigned ${attendance.length === 1 ? "class" : "classes"}`;

  // The period register is time-sensitive, so the way in sits at the top of the
  // dashboard with the live period on it rather than only in the sidebar.
  const clock = schoolClock();
  const periods = user.access.periodAttendance?.view ? await getPeriods() : [];
  const livePeriod = findLivePeriod(periods, clock.minutes);
  const nextPeriod = findNextPeriod(periods, clock.minutes);

  return (
    <>
      <PageHeader
        title={t("dash.greeting", { name: user.name.split(" ")[0] })}
        description={`${t(`role.${user.role}`)} · ${formatDate(day, locale)} · ${year?.name ?? "—"} · ${scope}`}
      />

      {/* Attendance by period --------------------------------------------- */}
      {user.access.periodAttendance?.view && periods.length > 0 && (
        <section
          className={`mb-8 flex flex-wrap items-center gap-4 rounded-xl border px-5 py-4 ${
            livePeriod
              ? "border-emerald-200 bg-emerald-50"
              : "border-ink-200 bg-white"
          }`}
        >
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-500">
              {t("pa.currentPeriod")} · {t("pa.schoolTime")} {clock.time}
            </p>
            <p
              className={`mt-1 text-lg font-semibold ${
                livePeriod ? "text-emerald-800" : "text-ink-700"
              }`}
            >
              {livePeriod ? (
                <>
                  {livePeriod.name}{" "}
                  <span className="text-sm font-normal tabular-nums">
                    {livePeriod.startTime} – {livePeriod.endTime}
                  </span>
                </>
              ) : nextPeriod ? (
                t("pa.between")
              ) : (
                t("pa.dayOver")
              )}
            </p>
            {nextPeriod && (
              <p className="mt-0.5 text-xs text-ink-500">
                {t("pa.nextPeriod", {
                  name: nextPeriod.name,
                  time: nextPeriod.startTime,
                })}
              </p>
            )}
          </div>
          <Link href="/period-attendance" className="btn-primary">
            {t("pa.dashboardCta")}
          </Link>
        </section>
      )}

      {/* Today's attendance ------------------------------------------------ */}
      <section className="mb-8">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-500">{t("dash.attendanceToday")}</h2>
          <Link
            href={`/attendance?date=${toISODate(day)}`}
            className="text-xs font-medium text-brand-600 hover:underline"
          >{t("dash.openRegister")}</Link>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <StatTile
            label={t("dash.attendanceRate")}
            value={rate === null ? "—" : `${rate.toFixed(1)}%`}
            hint={t("dash.recordedOf", { recorded: totals.recorded, enrolled: totals.enrolled })}
            tone={rate === null ? "neutral" : rate >= 90 ? "positive" : "warning"}
          />
          <StatTile label={t("attendance.PRESENT")} value={totals.present} tone="positive" />
          <StatTile label={t("attendance.ABSENT")} value={totals.absent} tone="danger" />
          <StatTile label={t("attendance.LATE")} value={totals.late} tone="warning" />
          <StatTile
            label={t("dash.registersTaken")}
            value={`${totals.taken}/${attendance.length}`}
            hint={
              totals.taken < attendance.length
                ? `${attendance.length - totals.taken} still pending`
                : t("dash.allComplete")
            }
            tone={totals.taken < attendance.length ? "warning" : "positive"}
          />
        </div>

        <Card className="mt-4" title={t("dash.byClass")} subtitle={formatDate(day, locale)}>
          {attendance.length === 0 ? (
            <EmptyState>No classes are assigned to you yet.</EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t("common.class")}</th>
                    <th className="w-48">{t("common.breakdown")}</th>
                    <th className="text-right">{t("attendance.PRESENT")}</th>
                    <th className="text-right">{t("attendance.ABSENT")}</th>
                    <th className="text-right">{t("attendance.LATE")}</th>
                    <th className="text-right">{t("attendance.EXCUSED")}</th>
                    <th className="text-right">{t("common.rate")}</th>
                    <th className="text-right">{t("common.status")}</th>
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
                          <bdi>{row.className}</bdi>
                        </Link>
                        <span className="ml-2 text-xs text-ink-400">
                          <bdi>{t("dash.nStudents", { n: row.enrolled })}</bdi>
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
                          <span className="badge bg-emerald-50 text-emerald-700">{t("dash.taken")}</span>
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
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-500">{t("dash.observationsWeek")}</h2>
          <Link
            href="/observations"
            className="text-xs font-medium text-brand-600 hover:underline"
          >{t("dash.openObservations")}</Link>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            label={t("dash.observationsLogged")}
            value={obsTotals.total}
            hint={`${formatShortDate(observations.from, locale)} – ${formatShortDate(observations.to, locale)}`}
            tone="brand"
          />
          <StatTile label={t("sentiment.POSITIVE")} value={obsTotals.positive} tone="positive" />
          <StatTile label={t("common.concerns")} value={obsTotals.concern} tone="danger" />
          <StatTile
            label={t("dash.classesWithEntries")}
            value={`${observations.rows.filter((r) => r.total > 0).length}/${observations.rows.length}`}
          />
        </div>

        <Card
          className="mt-4"
          title={t("dash.byClass")}
          subtitle={`Week of ${formatDate(observations.from, locale)}`}
        >
          {observations.rows.length === 0 ? (
            <EmptyState>No classes are assigned to you yet.</EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t("common.class")}</th>
                    <th className="text-right">{t("common.total")}</th>
                    <th className="text-right">{t("sentiment.POSITIVE")}</th>
                    <th className="text-right">{t("sentiment.NEUTRAL")}</th>
                    <th className="text-right">{t("sentiment.CONCERN")}</th>
                    <th className="text-right">{t("dash.studentsCovered")}</th>
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
                          <bdi>{row.className}</bdi>
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
  const { locale, t } = await getI18n();
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
        description={`${formatDate(day, locale)} · ${t("dash.familyWindow")}`}
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
                <Link
                  key={student.id}
                  href={`/students/${student.id}`}
                  className="card px-5 py-4 transition-colors hover:border-brand-300"
                >
                  <p className="font-medium text-ink-900">
                    {student.firstName} {student.lastName}
                  </p>
                  <p className="text-xs text-ink-500">
                    {student.class?.name ?? t("common.unassigned")} · {student.code}
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
                </Link>
              );
            })}
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title={t("dash.recentAttendance")}>
              {attendance.length === 0 ? (
                <EmptyState>{t("dash.noAttendance")}</EmptyState>
              ) : (
                <div className="overflow-x-auto">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>{t("common.date")}</th>
                        <th>{t("common.student")}</th>
                        <th className="text-right">{t("common.status")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attendance.slice(0, 12).map((row) => (
                        <tr key={row.id}>
                          <td className="whitespace-nowrap text-ink-500">
                            {formatShortDate(row.date, locale)}
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

            <Card title={t("dash.recentObservations")}>
              {observations.length === 0 ? (
                <EmptyState>{t("dash.noObservations")}</EmptyState>
              ) : (
                <ul className="divide-y divide-ink-100">
                  {observations.slice(0, 8).map((row) => (
                    <li key={row.id} className="px-5 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs text-ink-500">
                          {formatShortDate(row.date, locale)} ·{" "}
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
