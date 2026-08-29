import Link from "next/link";
import { requireModule } from "@/lib/auth";
import { getI18n } from "@/lib/locale";
import { prisma } from "@/lib/db";
import { formatDate, toDayKey, today, toISODate } from "@/lib/dates";
import {
  getAttendanceSummaryForDay,
  getCurrentYear,
  getVisibleClassIds,
} from "@/lib/queries";
import { AttendanceBar, Card, EmptyState, PageHeader, StatTile } from "@/components/ui";
import Register, { type RegisterStudent } from "./register";
import { ATTENDANCE_STATUSES, type AttendanceStatus } from "@/lib/constants";

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ classId?: string; date?: string }>;
}) {
  const user = await requireModule("attendance");
  const { locale, t } = await getI18n();
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

  const statusLabels = Object.fromEntries(
    ATTENDANCE_STATUSES.map((s) => [s, t(`attendance.${s}`)]),
  ) as Record<AttendanceStatus, string>;

  return (
    <>
      <PageHeader
        title={t("module.attendance.label")}
        description={`${formatDate(date, locale)} · ${
          visible === "ALL" ? t("dash.allClasses") : t("common.yourClasses")
        }`}
      />

      {/* Class + date picker */}
      <form className="mb-6 flex flex-wrap items-end gap-3" action="/attendance">
        <div>
          <label className="label" htmlFor="classId">{t("common.class")}</label>
          <select
            id="classId"
            name="classId"
            className="select w-56"
            defaultValue={selectedClassId ?? ""}
          >
            {classes.length === 0 && <option value="">{t("common.noClassesAvailable")}</option>}
            {classes.map((klass) => (
              <option key={klass.id} value={klass.id}>{klass.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="date">{t("common.date")}</label>
          <input
            id="date"
            name="date"
            type="date"
            className="input w-44"
            defaultValue={dateParam}
            max={toISODate(today())}
          />
        </div>
        <button type="submit" className="btn-secondary">{t("att.openRegister")}</button>
      </form>

      {classes.length === 0 ? (
        <Card>
          <EmptyState>{t("common.noClassesForYou")}</EmptyState>
        </Card>
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile
              label={t("att.recordedToday")}
              value={recorded}
              hint={t(
                summary.length === 1 ? "att.acrossOneClass" : "att.acrossClasses",
                { n: summary.length },
              )}
            />
            <StatTile label={t("attendance.PRESENT")} value={dayTotals.present} tone="positive" />
            <StatTile label={t("attendance.ABSENT")} value={dayTotals.absent} tone="danger" />
            <StatTile label={t("attendance.LATE")} value={dayTotals.late} tone="warning" />
          </div>

          {isFuture && (
            <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-900">
              {t("att.futureDate")}
            </div>
          )}
          {!isOwnClass && !isFuture && (
            <div className="mb-5 rounded-xl border border-ink-200 bg-white px-5 py-3 text-sm text-ink-600">
              {t("att.readOnly")}
            </div>
          )}

          <div className="mb-6">
            {students.length === 0 ? (
              <Card>
                <EmptyState>{t("pa.noStudents")}</EmptyState>
              </Card>
            ) : (
              <Register
                classId={selectedClassId!}
                date={dateParam}
                students={students}
                readOnly={!canWrite}
                labels={{
                  save: t("att.saveRegister"),
                  quickFill: t("pa.quickFill"),
                  allPresent: t("pa.allPresent"),
                  clear: t("action.clear"),
                  // Raw template: the client fills it as the count changes.
                  markedTemplate: t("pa.marked"),
                  code: t("common.code"),
                  student: t("common.student"),
                  status: t("common.status"),
                  note: t("common.note"),
                  noteForTemplate: t("att.noteFor"),
                  optional: t("att.optional"),
                  statusLabels,
                }}
              />
            )}
          </div>

          <Card title={t("att.allClassesOnDate")} subtitle={formatDate(date, locale)}>
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t("common.class")}</th>
                    <th className="w-48">{t("common.breakdown")}</th>
                    <th className="text-end">{t("attendance.PRESENT")}</th>
                    <th className="text-end">{t("attendance.ABSENT")}</th>
                    <th className="text-end">{t("attendance.LATE")}</th>
                    <th className="text-end">{t("attendance.EXCUSED")}</th>
                    <th className="text-end">{t("common.status")}</th>
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
                          <span className="badge bg-emerald-50 text-emerald-700">{t("dash.taken")}</span>
                        ) : (
                          <span className="badge bg-amber-50 text-amber-700">{t("att.notTaken")}</span>
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
