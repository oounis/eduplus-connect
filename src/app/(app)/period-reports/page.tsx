import Link from "next/link";
import { requireModule } from "@/lib/auth";
import { getI18n } from "@/lib/locale";
import { addDays, formatShortDate, toDayKey, toISODate } from "@/lib/dates";
import { getPeriodReport, resolvePeriodReportScope } from "@/lib/periods";
import { schoolClock } from "@/lib/school-time";
import {
  AttendanceBar,
  Card,
  EmptyState,
  PageHeader,
  StatTile,
} from "@/components/ui";

/** `?classId=a&classId=b` — Next hands these over as string | string[]. */
type Multi = string | string[] | undefined;

function rate(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(1)}%`;
}

export default async function PeriodReportsPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
    classId?: Multi;
    periodId?: Multi;
  }>;
}) {
  const user = await requireModule("periodReports");
  const { locale, t } = await getI18n();
  const params = await searchParams;

  const scope = await resolvePeriodReportScope(user, params);
  const report = await getPeriodReport(scope);

  const today = toDayKey(schoolClock().dateISO);
  const quickRanges = [
    { label: t("pr.todayOnly"), from: today, to: today },
    { label: t("pr.last7"), from: addDays(today, -6), to: today },
    { label: t("pr.last14"), from: addDays(today, -13), to: today },
    { label: t("pr.last30"), from: addDays(today, -29), to: today },
  ];

  // Keep the current filters on the export link and the quick-range chips.
  const query = new URLSearchParams();
  query.set("from", scope.fromISO);
  query.set("to", scope.toISO);
  for (const id of scope.selectedClassIds) query.append("classId", id);
  for (const id of scope.selectedPeriodIds) query.append("periodId", id);

  const filterQuery = new URLSearchParams();
  for (const id of scope.selectedClassIds) filterQuery.append("classId", id);
  for (const id of scope.selectedPeriodIds) filterQuery.append("periodId", id);

  const hasRows = report.byPeriod.length > 0;

  return (
    <>
      <PageHeader
        title={t("pr.title")}
        description={t("pr.subtitle")}
        actions={
          <Link
            href={`/period-reports/export?${query.toString()}`}
            className="btn-primary btn-sm"
            prefetch={false}
          >
            {t("pr.exportExcel")}
          </Link>
        }
      />

      {/* Filters ------------------------------------------------------------ */}
      <form className="card mb-6 px-5 py-4" action="/period-reports">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="label" htmlFor="from">
              {t("pr.from")}
            </label>
            <input
              id="from"
              name="from"
              type="date"
              className="input w-44"
              defaultValue={scope.fromISO}
            />
          </div>
          <div>
            <label className="label" htmlFor="to">
              {t("pr.to")}
            </label>
            <input
              id="to"
              name="to"
              type="date"
              className="input w-44"
              defaultValue={scope.toISO}
            />
          </div>
          <button type="submit" className="btn-secondary">
            {t("pr.apply")}
          </button>
        </div>

        {/* Multi-select: checkboxes, not a <select multiple>, because a
            multi-select is unusable on a phone and invisible to a parent. */}
        <fieldset className="mt-4">
          <legend className="label">
            {t("pr.classes")}
            {scope.selectedClassIds.length > 0 && (
              <span className="ms-2 text-ink-400">
                {t("pr.selected", { n: scope.selectedClassIds.length })}
              </span>
            )}
          </legend>
          <div className="flex flex-wrap gap-1.5">
            {scope.classes.length === 0 && (
              <span className="text-xs text-ink-500">—</span>
            )}
            {scope.classes.map((klass) => (
              <label
                key={klass.id}
                className="cursor-pointer rounded-lg border border-ink-200 px-2.5 py-1 text-xs text-ink-600 transition-colors has-checked:border-brand-400 has-checked:bg-brand-50 has-checked:text-brand-800 hover:bg-ink-50"
              >
                <input
                  type="checkbox"
                  name="classId"
                  value={klass.id}
                  defaultChecked={scope.selectedClassIds.includes(klass.id)}
                  className="sr-only"
                />
                {klass.name}
              </label>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-ink-400">
            {scope.selectedClassIds.length === 0 ? t("pr.allClasses") : ""}
          </p>
        </fieldset>

        <fieldset className="mt-3">
          <legend className="label">
            {t("pr.periods")}
            {scope.selectedPeriodIds.length > 0 && (
              <span className="ms-2 text-ink-400">
                {t("pr.selected", { n: scope.selectedPeriodIds.length })}
              </span>
            )}
          </legend>
          <div className="flex flex-wrap gap-1.5">
            {scope.periods.length === 0 && (
              <span className="text-xs text-ink-500">—</span>
            )}
            {scope.periods.map((period) => (
              <label
                key={period.id}
                className="cursor-pointer rounded-lg border border-ink-200 px-2.5 py-1 text-xs text-ink-600 transition-colors has-checked:border-brand-400 has-checked:bg-brand-50 has-checked:text-brand-800 hover:bg-ink-50"
              >
                <input
                  type="checkbox"
                  name="periodId"
                  value={period.id}
                  defaultChecked={scope.selectedPeriodIds.includes(period.id)}
                  className="sr-only"
                />
                {period.name}
              </label>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-ink-400">
            {scope.selectedPeriodIds.length === 0 ? t("pr.allPeriods") : ""}
          </p>
        </fieldset>

        <div className="mt-4 flex flex-wrap gap-1.5">
          {quickRanges.map((range) => {
            const params = new URLSearchParams(filterQuery);
            params.set("from", toISODate(range.from));
            params.set("to", toISODate(range.to));
            const active =
              scope.fromISO === toISODate(range.from) &&
              scope.toISO === toISODate(range.to);
            return (
              <Link
                key={range.label}
                href={`/period-reports?${params.toString()}`}
                className={`rounded-lg border px-2.5 py-1 text-xs transition-colors ${
                  active
                    ? "border-brand-400 bg-brand-50 text-brand-800"
                    : "border-ink-200 text-ink-600 hover:bg-ink-50"
                }`}
              >
                {range.label}
              </Link>
            );
          })}
        </div>
      </form>

      {!hasRows ? (
        <Card>
          <EmptyState>{t("pr.empty")}</EmptyState>
        </Card>
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <StatTile label={t("common.records")} value={report.totals.recorded} />
            <StatTile
              label={t("attendance.PRESENT")}
              value={report.totals.present}
              tone="positive"
            />
            <StatTile
              label={t("attendance.ABSENT")}
              value={report.totals.absent}
              tone="danger"
            />
            <StatTile
              label={t("attendance.LATE")}
              value={report.totals.late}
              tone="warning"
            />
            <StatTile
              label={t("common.rate")}
              value={rate(report.totals.rate)}
              tone="brand"
            />
          </div>

          <Card
            title={t("pr.byPeriod")}
            subtitle={`${scope.fromISO} → ${scope.toISO}`}
            className="mb-6"
          >
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t("pa.period")}</th>
                    <th className="w-28">{t("pr.time")}</th>
                    <th className="w-48">{t("common.breakdown")}</th>
                    <th className="text-end">{t("attendance.PRESENT")}</th>
                    <th className="text-end">{t("attendance.ABSENT")}</th>
                    <th className="text-end">{t("attendance.LATE")}</th>
                    <th className="text-end">{t("attendance.EXCUSED")}</th>
                    <th className="text-end">{t("common.rate")}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.byPeriod.map((row) => (
                    <tr key={row.key}>
                      <td className="font-medium text-ink-900">{row.periodName}</td>
                      <td className="tabular-nums text-xs text-ink-500">
                        {row.startTime}–{row.endTime}
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
                      <td className="text-end tabular-nums">{rate(row.rate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card title={t("pr.byPeriodClass")} className="mb-6">
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t("pa.period")}</th>
                    <th>{t("common.class")}</th>
                    <th className="text-end">{t("attendance.PRESENT")}</th>
                    <th className="text-end">{t("attendance.ABSENT")}</th>
                    <th className="text-end">{t("attendance.LATE")}</th>
                    <th className="text-end">{t("attendance.EXCUSED")}</th>
                    <th className="text-end">{t("common.rate")}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.byPeriodClass.map((row) => (
                    <tr key={row.key}>
                      <td className="font-medium text-ink-900">{row.periodName}</td>
                      <td>{row.className}</td>
                      <td className="text-end tabular-nums">{row.present}</td>
                      <td className="text-end tabular-nums">{row.absent}</td>
                      <td className="text-end tabular-nums">{row.late}</td>
                      <td className="text-end tabular-nums">{row.excused}</td>
                      <td className="text-end tabular-nums">{rate(row.rate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card title={t("pr.byDayPeriod")}>
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th className="w-32">{t("common.date")}</th>
                    <th>{t("pa.period")}</th>
                    <th className="text-end">{t("attendance.PRESENT")}</th>
                    <th className="text-end">{t("attendance.ABSENT")}</th>
                    <th className="text-end">{t("attendance.LATE")}</th>
                    <th className="text-end">{t("attendance.EXCUSED")}</th>
                    <th className="text-end">{t("common.rate")}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.byDayPeriod.map((row) => (
                    <tr key={row.key}>
                      <td className="text-xs text-ink-600">
                        {formatShortDate(toDayKey(row.dateISO!), locale)}
                      </td>
                      <td className="font-medium text-ink-900">{row.periodName}</td>
                      <td className="text-end tabular-nums">{row.present}</td>
                      <td className="text-end tabular-nums">{row.absent}</td>
                      <td className="text-end tabular-nums">{row.late}</td>
                      <td className="text-end tabular-nums">{row.excused}</td>
                      <td className="text-end tabular-nums">{rate(row.rate)}</td>
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
