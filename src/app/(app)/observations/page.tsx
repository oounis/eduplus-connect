import { ConfirmSubmit } from "@/components/confirm-submit";
import Link from "next/link";
import { requireModule } from "@/lib/auth";
import { getI18n } from "@/lib/locale";
import { prisma } from "@/lib/db";
import {
  endOfWeek,
  formatDate,
  formatShortDate,
  startOfWeek,
  today,
  toISODate,
} from "@/lib/dates";
import {
  getCurrentYear,
  getObservationSummaryForWeek,
  getVisibleClassIds,
} from "@/lib/queries";
import {
  Card,
  EmptyState,
  PageHeader,
  SentimentBadge,
  StatTile,
} from "@/components/ui";
import { ActionForm, Disclosure } from "@/components/action-form";
import { OBSERVATION_CATEGORIES, SENTIMENTS } from "@/lib/constants";
import { createObservation, deleteObservation } from "./actions";

export default async function ObservationsPage({
  searchParams,
}: {
  searchParams: Promise<{ classId?: string; date?: string }>;
}) {
  const user = await requireModule("observations");
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

  const selectedClassId =
    params.classId && classes.some((c) => c.id === params.classId)
      ? params.classId
      : classes[0]?.id;
  const dateParam = params.date ?? toISODate(today());

  const isOwnClass =
    user.role === "ADMIN" ||
    user.role === "DEPUTY" ||
    (visible !== "ALL" && selectedClassId ? visible.includes(selectedClassId) : false);
  const canWrite = user.access.observations.edit && isOwnClass;

  const weekStart = startOfWeek(today());
  const weekEnd = endOfWeek(today());

  const [roster, weekObservations, summary] = await Promise.all([
    selectedClassId
      ? prisma.student.findMany({
          where: { classId: selectedClassId, isActive: true },
          orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        })
      : Promise.resolve([]),
    prisma.observation.findMany({
      where: {
        classId: { in: classes.map((c) => c.id) },
        date: { gte: weekStart, lte: weekEnd },
        ...(selectedClassId ? { classId: selectedClassId } : {}),
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      include: { student: true, author: true, class: true },
      take: 200,
    }),
    getObservationSummaryForWeek(
      today(),
      classes.map((c) => c.id),
    ),
  ]);

  const totals = summary.rows.reduce(
    (acc, row) => ({
      total: acc.total + row.total,
      positive: acc.positive + row.positive,
      concern: acc.concern + row.concern,
    }),
    { total: 0, positive: 0, concern: 0 },
  );

  // Group the week's entries by day for the list view.
  const byDay = new Map<string, typeof weekObservations>();
  for (const row of weekObservations) {
    const key = toISODate(row.date);
    byDay.set(key, [...(byDay.get(key) ?? []), row]);
  }
  const days = [...byDay.keys()].sort().reverse();

  return (
    <>
      <PageHeader
        title={t("module.observations.label")}
        description={`${t("obs.weekOf", {
          date: formatDate(weekStart, locale),
        })} — ${visible === "ALL" ? t("dash.allClasses") : t("common.yourClasses")}`}
      />

      <form className="mb-6 flex flex-wrap items-end gap-3" action="/observations">
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
        <button type="submit" className="btn-secondary">{t("obs.showClass")}</button>
      </form>

      {classes.length === 0 ? (
        <Card>
          <EmptyState>{t("common.noClassesForYou")}</EmptyState>
        </Card>
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile label={t("common.thisWeek")} value={totals.total} tone="brand" hint={t("obs.allYourClasses")} />
            <StatTile label={t("sentiment.POSITIVE")} value={totals.positive} tone="positive" />
            <StatTile label={t("common.concerns")} value={totals.concern} tone="danger" />
            <StatTile
              label={t("obs.entriesShown")}
              value={weekObservations.length}
              hint={selectedClassId ? t("obs.selectedClass") : t("dash.allClasses")}
            />
          </div>

          {canWrite && selectedClassId && roster.length > 0 && (
            <div className="mb-6">
              <Disclosure label={t("obs.add")}>
                <ActionForm
                  action={createObservation}
                  submitLabel={t("obs.addSubmit")}
                  resetOnSuccess
                >
                  <input type="hidden" name="classId" value={selectedClassId} />
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <label className="label" htmlFor="studentId">{t("common.student")}</label>
                      <select id="studentId" name="studentId" className="select" required>
                        {roster.map((student) => (
                          <option key={student.id} value={student.id}>
                            {student.lastName}, {student.firstName}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="label" htmlFor="date">{t("common.date")}</label>
                      <input
                        id="date"
                        name="date"
                        type="date"
                        className="input"
                        defaultValue={dateParam}
                        max={toISODate(today())}
                        required
                      />
                    </div>
                    <div>
                      <label className="label" htmlFor="category">{t("obs.category")}</label>
                      <select id="category" name="category" className="select" defaultValue="BEHAVIOR">
                        {OBSERVATION_CATEGORIES.map((category) => (
                          <option key={category} value={category}>
                            {t(`observation.${category}`)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="label" htmlFor="sentiment">{t("obs.sentiment")}</label>
                      <select id="sentiment" name="sentiment" className="select" defaultValue="NEUTRAL">
                        {SENTIMENTS.map((sentiment) => (
                          <option key={sentiment} value={sentiment}>
                            {t(`sentiment.${sentiment}`)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="sm:col-span-2 lg:col-span-4">
                      <label className="label" htmlFor="note">{t("obs.observation")}</label>
                      <textarea
                        id="note"
                        name="note"
                        rows={2}
                        className="input"
                        placeholder={t("obs.placeholder")}
                        required
                      />
                    </div>
                  </div>
                </ActionForm>
              </Disclosure>
            </div>
          )}

          {!isOwnClass && (
            <div className="mb-5 rounded-xl border border-ink-200 bg-white px-5 py-3 text-sm text-ink-600">
              {t("obs.readOnly")}
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="space-y-5 lg:col-span-2">
              {days.length === 0 ? (
                <Card>
                  <EmptyState>{t("obs.noneThisWeek")}</EmptyState>
                </Card>
              ) : (
                days.map((day) => {
                  const rows = byDay.get(day)!;
                  return (
                    <Card
                      key={day}
                      title={formatDate(new Date(`${day}T00:00:00.000Z`), locale)}
                      subtitle={t(
                        rows.length === 1 ? "obs.entryCount" : "obs.entriesCount",
                        { n: rows.length },
                      )}
                    >
                      <ul className="divide-y divide-ink-100">
                        {rows.map((row) => {
                          const mine = row.authorId === user.userId;
                          const canDelete =
                            user.access.observations.edit &&
                            (mine || user.role === "ADMIN" || user.role === "DEPUTY");
                          return (
                            <li key={row.id} className="px-5 py-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-ink-900">
                                    {row.student.firstName} {row.student.lastName}
                                  </span>
                                  <span className="badge bg-ink-100 text-ink-600">
                                    {t(`observation.${row.category}`)}
                                  </span>
                                  <SentimentBadge sentiment={row.sentiment} />
                                </div>
                                {canDelete && (
                                  <form action={deleteObservation}>
                                    <input type="hidden" name="id" value={row.id} />
                                    <ConfirmSubmit
                                      className="btn-danger btn-sm"
                                      message={t("obs.deleteConfirm")}
                                    >
                                      {t("action.delete")}
                                    </ConfirmSubmit>
                                  </form>
                                )}
                              </div>
                              <p className="mt-1.5 text-sm text-ink-700">{row.note}</p>
                              <p className="mt-1 text-xs text-ink-400">
                                {row.class.name} · {row.author.firstName}{" "}
                                {row.author.lastName}
                                {mine && ` ${t("common.you")}`}
                              </p>
                            </li>
                          );
                        })}
                      </ul>
                    </Card>
                  );
                })
              )}
            </div>

            <div>
              <Card
                title={t("obs.thisWeekByClass")}
                subtitle={`${formatShortDate(summary.from, locale)} – ${formatShortDate(summary.to, locale)}`}
              >
                {summary.rows.length === 0 ? (
                  <EmptyState>{t("obs.noClasses")}</EmptyState>
                ) : (
                  <ul className="divide-y divide-ink-100">
                    {summary.rows.map((row) => (
                      <li key={row.classId} className="px-5 py-3">
                        <div className="flex items-center justify-between">
                          <Link
                            href={`/observations?classId=${row.classId}`}
                            className="text-sm font-medium text-ink-900 hover:text-brand-600"
                          >
                            {row.className}
                          </Link>
                          <span className="text-sm font-semibold tabular-nums">
                            {row.total}
                          </span>
                        </div>
                        <div className="mt-1 flex gap-3 text-xs text-ink-500">
                          <span className="text-emerald-600">{t("obs.nPositive", { n: row.positive })}</span>
                          <span>{t("obs.nNeutral", { n: row.neutral })}</span>
                          <span className="text-red-600">{t("obs.nConcern", { n: row.concern })}</span>
                        </div>
                        <p className="mt-0.5 text-xs text-ink-400">
                          {t("obs.covered", {
                            covered: row.studentsCovered,
                            enrolled: row.enrolled,
                          })}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </div>
        </>
      )}
    </>
  );
}
