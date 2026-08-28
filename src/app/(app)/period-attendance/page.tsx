import { requireModule } from "@/lib/auth";
import { getI18n } from "@/lib/locale";
import { formatDate, toDayKey, toISODate } from "@/lib/dates";
import { getPeriodContext } from "@/lib/periods";
import {
  SCHOOL_TIMEZONE,
  findNextPeriod,
  periodState,
} from "@/lib/school-time";
import { ATTENDANCE_STATUSES, type AttendanceStatus } from "@/lib/constants";
import { Card, EmptyState, PageHeader, StatTile } from "@/components/ui";
import PeriodRegister from "./register";

export default async function PeriodAttendancePage({
  searchParams,
}: {
  searchParams: Promise<{
    teacherId?: string;
    classId?: string;
    periodId?: string;
    date?: string;
  }>;
}) {
  const user = await requireModule("periodAttendance");
  const { locale, t } = await getI18n();
  const params = await searchParams;

  const context = await getPeriodContext(user, params);
  const {
    clock,
    periods,
    livePeriod,
    selectedPeriod,
    teachers,
    selectedTeacherId,
    classes,
    selectedClassId,
    students,
    access,
    teacherPickerLocked,
  } = context;

  const nextPeriod = findNextPeriod(periods, clock.minutes);
  const readOnly = !access.canWrite;

  const statusLabels = Object.fromEntries(
    ATTENDANCE_STATUSES.map((s) => [s, t(`attendance.${s}`)]),
  ) as Record<AttendanceStatus, string>;

  // Counts for the tiles — what this register currently says.
  const totals = students.reduce(
    (acc, s) => {
      if (s.status) acc.recorded += 1;
      if (s.status === "PRESENT") acc.present += 1;
      if (s.status === "ABSENT") acc.absent += 1;
      if (s.status === "LATE") acc.late += 1;
      return acc;
    },
    { recorded: 0, present: 0, absent: 0, late: 0 },
  );

  return (
    <>
      <PageHeader
        title={t("pa.title")}
        description={`${formatDate(toDayKey(context.dateISO), locale)} · ${t("pa.schoolTime")} ${clock.time} (${SCHOOL_TIMEZONE})`}
      />

      {/* What is running right now ---------------------------------------- */}
      <div
        className={`mb-6 rounded-xl border px-5 py-4 ${
          livePeriod
            ? "border-emerald-200 bg-emerald-50"
            : "border-ink-200 bg-white"
        }`}
      >
        <p className="text-xs font-medium uppercase tracking-wide text-ink-500">
          {t("pa.currentPeriod")}
        </p>
        {livePeriod ? (
          <p className="mt-1 text-lg font-semibold text-emerald-800">
            {livePeriod.name}{" "}
            <span className="text-sm font-normal tabular-nums text-emerald-700">
              {livePeriod.startTime} – {livePeriod.endTime}
            </span>
          </p>
        ) : (
          <p className="mt-1 text-lg font-semibold text-ink-700">
            {periods.length === 0
              ? t("pa.noPeriods")
              : nextPeriod
                ? t("pa.between")
                : t("pa.dayOver")}
          </p>
        )}
        {nextPeriod && (
          <p className="mt-0.5 text-xs text-ink-500">
            {t("pa.nextPeriod", {
              name: nextPeriod.name,
              time: nextPeriod.startTime,
            })}
          </p>
        )}

        {periods.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {periods.map((period) => {
              const state = periodState(period, clock.minutes);
              const isSelected = selectedPeriod?.id === period.id;
              const tone =
                state === "live"
                  ? "border-emerald-400 bg-white text-emerald-800"
                  : state === "after"
                    ? "border-ink-200 bg-white text-ink-400"
                    : "border-ink-200 bg-white text-ink-600";
              return (
                <span
                  key={period.id}
                  className={`rounded-lg border px-2.5 py-1 text-xs tabular-nums ${tone} ${
                    isSelected ? "ring-2 ring-brand-300" : ""
                  } ${period.isActive ? "" : "line-through opacity-50"}`}
                >
                  {period.name} · {period.startTime}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* Teacher → class → period → date ----------------------------------- */}
      <form
        className="mb-6 flex flex-wrap items-end gap-3"
        action="/period-attendance"
      >
        <div>
          <label className="label" htmlFor="teacherId">
            {t("pa.teacher")}
          </label>
          {teacherPickerLocked ? (
            <>
              <input type="hidden" name="teacherId" value={selectedTeacherId ?? ""} />
              <p className="input w-56 bg-ink-50 text-ink-600">
                {teachers[0]?.name ?? "—"}
              </p>
            </>
          ) : (
            <select
              id="teacherId"
              name="teacherId"
              className="select w-56"
              defaultValue={selectedTeacherId ?? ""}
            >
              {teachers.length === 0 && (
                <option value="">{t("pa.noTeachers")}</option>
              )}
              {teachers.map((teacher) => (
                <option key={teacher.id} value={teacher.id}>
                  {teacher.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <div>
          <label className="label" htmlFor="classId">
            {t("pa.class")}
          </label>
          <select
            id="classId"
            name="classId"
            className="select w-48"
            defaultValue={selectedClassId ?? ""}
          >
            {classes.length === 0 && <option value="">—</option>}
            {classes.map((klass) => (
              <option key={klass.id} value={klass.id}>
                {klass.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label" htmlFor="periodId">
            {t("pa.period")}
          </label>
          <select
            id="periodId"
            name="periodId"
            className="select w-48"
            defaultValue={selectedPeriod?.id ?? ""}
          >
            {periods.length === 0 && <option value="">—</option>}
            {periods.map((period) => (
              <option key={period.id} value={period.id}>
                {period.name} ({period.startTime}–{period.endTime})
                {periodState(period, clock.minutes) === "live" ? " ●" : ""}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label" htmlFor="date">
            {t("common.date")}
          </label>
          <input
            id="date"
            name="date"
            type="date"
            className="input w-44"
            defaultValue={context.dateISO}
            max={toISODate(context.todayKey)}
          />
        </div>

        <button type="submit" className="btn-secondary">
          {t("pa.open")}
        </button>
      </form>

      {periods.length === 0 ? (
        <Card>
          <EmptyState>{t("pa.noPeriods")}</EmptyState>
        </Card>
      ) : teachers.length === 0 ? (
        <Card>
          <EmptyState>{t("pa.noTeachers")}</EmptyState>
        </Card>
      ) : classes.length === 0 ? (
        <Card>
          <EmptyState>{t("pa.noClasses")}</EmptyState>
        </Card>
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile
              label={t("common.records")}
              value={`${totals.recorded}/${students.length}`}
            />
            <StatTile
              label={t("attendance.PRESENT")}
              value={totals.present}
              tone="positive"
            />
            <StatTile
              label={t("attendance.ABSENT")}
              value={totals.absent}
              tone="danger"
            />
            <StatTile
              label={t("attendance.LATE")}
              value={totals.late}
              tone="warning"
            />
          </div>

          {readOnly && (
            <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-900">
              {t(`pa.lock.${access.reason}`)}
            </div>
          )}
          {!readOnly &&
            (user.role === "ADMIN" || user.role === "DEPUTY") &&
            selectedPeriod?.id !== livePeriod?.id && (
              <div className="mb-5 rounded-xl border border-brand-200 bg-brand-50 px-5 py-3 text-sm text-brand-800">
                {t("pa.adminOverride")}
              </div>
            )}

          {students.length === 0 ? (
            <Card>
              <EmptyState>{t("pa.noStudents")}</EmptyState>
            </Card>
          ) : (
            <PeriodRegister
              classId={selectedClassId!}
              periodId={selectedPeriod!.id}
              teacherId={selectedTeacherId ?? ""}
              date={context.dateISO}
              students={students}
              readOnly={readOnly}
              labels={{
                save: t("pa.save"),
                quickFill: t("pa.quickFill"),
                allPresent: t("pa.allPresent"),
                clear: t("action.clear"),
                // Raw template: the client fills it as the count changes.
                markedTemplate: t("pa.marked"),
                code: t("common.code"),
                student: t("common.student"),
                status: t("common.status"),
                note: t("common.note"),
                recordedBy: t("pa.recordedBy"),
                notRecorded: t("pa.notRecorded"),
                optional: t("common.note"),
                statusLabels,
              }}
            />
          )}
        </>
      )}
    </>
  );
}
