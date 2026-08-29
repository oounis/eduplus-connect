import { ConfirmSubmit } from "@/components/confirm-submit";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireModule } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatShortDate, today, toISODate } from "@/lib/dates";
import { getAttendanceSummaryForDay, getObservationSummaryForWeek } from "@/lib/queries";
import { getI18n } from "@/lib/locale";
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
  const { locale, t } = await getI18n();
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
        description={t("cls.detailMeta", {
          level: klass.level,
          year: klass.academicYear.name,
          room: klass.room ?? "—",
        })}
        actions={
          <>
            <Link
              href={`/attendance?classId=${klass.id}&date=${toISODate(day)}`}
              className="btn-secondary btn-sm"
            >
              {t("module.attendance.label")}
            </Link>
            <Link href={`/observations?classId=${klass.id}`} className="btn-secondary btn-sm">
              {t("module.observations.label")}
            </Link>
            <Link href="/classes" className="btn-secondary btn-sm">
              {t("action.back")}
            </Link>
          </>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label={t("common.students")} value={klass.students.length} hint={t("cls.capacityN", { n: klass.capacity })} />
        <StatTile
          label={t("cls.attendanceToday")}
          value={attendanceToday?.rate === null || !attendanceToday ? "—" : `${attendanceToday.rate.toFixed(0)}%`}
          hint={attendanceToday?.taken ? t("cls.nRecorded", { n: attendanceToday.recorded }) : t("cls.registerNotTaken")}
          tone={attendanceToday?.taken ? "positive" : "warning"}
        />
        <StatTile
          label={t("cls.observationsWeek")}
          value={observationsWeek?.total ?? 0}
          hint={t("cls.nConcerns", { n: observationsWeek?.concern ?? 0 })}
          tone="brand"
        />
        <StatTile
          label={t("cls.staffAssigned")}
          value={klass.supervisors.length + klass.teachers.length}
          hint={t("cls.staffHint", {
            supervisors: klass.supervisors.length,
            teachers: klass.teachers.length,
          })}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card title={t("common.students")} subtitle={t("cls.nEnrolled", { n: klass.students.length })}>
            {klass.students.length === 0 ? (
              <EmptyState>{t("cls.noStudents")}</EmptyState>
            ) : (
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>{t("common.code")}</th>
                      <th>{t("periods.name")}</th>
                      <th className="text-end">{t("common.status")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {klass.students.map((student) => (
                      <tr key={student.id}>
                        <td className="font-mono text-xs text-ink-500">{student.code}</td>
                        <td className="font-medium text-ink-900">
                          {student.lastName}, {student.firstName}
                        </td>
                        <td className="text-end">
                          {student.isActive ? (
                            <span className="badge bg-emerald-50 text-emerald-700">{t("common.active")}</span>
                          ) : (
                            <span className="badge bg-ink-100 text-ink-500">{t("common.inactive")}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card title={t("cls.latestObservations")}>
            {recentObservations.length === 0 ? (
              <EmptyState>{t("cls.noObservations")}</EmptyState>
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
                      {formatShortDate(row.date, locale)} · {row.author.firstName} {row.author.lastName}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          {attendanceToday && (
            <Card title={t("cls.todayRegister")}>
              <div className="px-5 py-4">
                <AttendanceBar
                  present={attendanceToday.present}
                  absent={attendanceToday.absent}
                  late={attendanceToday.late}
                  excused={attendanceToday.excused}
                />
                <dl className="mt-4 space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-ink-500">{t("attendance.PRESENT")}</dt>
                    <dd className="tabular-nums">{attendanceToday.present}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-ink-500">{t("attendance.LATE")}</dt>
                    <dd className="tabular-nums">{attendanceToday.late}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-ink-500">{t("attendance.EXCUSED")}</dt>
                    <dd className="tabular-nums">{attendanceToday.excused}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-ink-500">{t("attendance.ABSENT")}</dt>
                    <dd className="tabular-nums font-medium text-red-600">
                      {attendanceToday.absent}
                    </dd>
                  </div>
                </dl>
              </div>
            </Card>
          )}

          <Card title={t("cls.assignedStaff")}>
            <div className="space-y-3 px-5 py-4 text-sm">
              <div>
                <p className="label">{t("cls.supervisors")}</p>
                {klass.supervisors.length === 0 ? (
                  <p className="text-ink-500">{t("cls.noneAssigned")}</p>
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
                <p className="label">{t("cls.teachers")}</p>
                {klass.teachers.length === 0 ? (
                  <p className="text-ink-500">{t("cls.noneAssigned")}</p>
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
            <Card title={t("cls.editClass")}>
              <div className="px-5 py-4">
                <ActionForm action={updateClass} submitLabel={t("action.saveChanges")}>
                  <input type="hidden" name="id" value={klass.id} />
                  <div className="space-y-3">
                    <div>
                      <label className="label" htmlFor="name">{t("periods.name")}</label>
                      <input id="name" name="name" className="input" defaultValue={klass.name} required />
                    </div>
                    <div>
                      <label className="label" htmlFor="level">{t("common.level")}</label>
                      <input id="level" name="level" className="input" defaultValue={klass.level} required />
                    </div>
                    <div>
                      <label className="label" htmlFor="room">{t("cls.room")}</label>
                      <input id="room" name="room" className="input" defaultValue={klass.room ?? ""} />
                    </div>
                    <div>
                      <label className="label" htmlFor="capacity">{t("cls.capacity")}</label>
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
                      <label className="label" htmlFor="academicYearId">{t("acad.year")}</label>
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
                    <ConfirmSubmit
                      className="btn-danger btn-sm"
                      message={t("cls.deleteConfirm", { name: klass.name })}
                    >
                      {t("cls.deleteClass")}
                    </ConfirmSubmit>
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
