import { requireModule } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getI18n } from "@/lib/locale";
import {
  SCHOOL_TIMEZONE,
  findLivePeriod,
  periodLength,
  schoolClock,
  sortPeriods,
} from "@/lib/school-time";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { ActionForm, Disclosure } from "@/components/action-form";
import { ConfirmSubmit } from "@/components/confirm-submit";
import {
  createPeriod,
  deletePeriod,
  togglePeriod,
  updatePeriod,
} from "./actions";

export default async function PeriodsPage() {
  const user = await requireModule("periods");
  const { t } = await getI18n();
  const canEdit = user.access.periods.edit;

  const rows = sortPeriods(
    await prisma.period.findMany({
      include: { _count: { select: { attendance: true } } },
    }),
  );
  const clock = schoolClock();
  const live = findLivePeriod(rows, clock.minutes);

  return (
    <>
      <PageHeader
        title={t("periods.title")}
        description={t("periods.subtitle", { tz: SCHOOL_TIMEZONE })}
        actions={
          <span className="badge bg-ink-100 text-ink-700">
            {t("pa.schoolTime")} {clock.time}
          </span>
        }
      />

      {canEdit ? (
        <div className="mb-6">
          <Disclosure label={t("periods.add")}>
            <ActionForm
              action={createPeriod}
              submitLabel={t("periods.create")}
              resetOnSuccess
            >
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="label" htmlFor="name">
                    {t("periods.name")}
                  </label>
                  <input
                    id="name"
                    name="name"
                    className="input"
                    placeholder={t("periods.namePlaceholder")}
                    required
                  />
                </div>
                <div>
                  <label className="label" htmlFor="startTime">
                    {t("periods.start")}
                  </label>
                  <input
                    id="startTime"
                    name="startTime"
                    type="time"
                    className="input"
                    required
                  />
                </div>
                <div>
                  <label className="label" htmlFor="endTime">
                    {t("periods.end")}
                  </label>
                  <input
                    id="endTime"
                    name="endTime"
                    type="time"
                    className="input"
                    required
                  />
                </div>
              </div>
            </ActionForm>
          </Disclosure>
        </div>
      ) : (
        <div className="mb-6 rounded-xl border border-ink-200 bg-white px-5 py-3 text-sm text-ink-600">
          {t("periods.readOnly")}
        </div>
      )}

      {rows.length === 0 ? (
        <Card>
          <EmptyState>{t("periods.empty")}</EmptyState>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((period) => {
            const length = periodLength(period);
            const isLive = live?.id === period.id;
            return (
              <Card key={period.id}>
                <div className="flex flex-wrap items-center gap-3 px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-ink-900">
                        {period.name}
                      </span>
                      {isLive && (
                        <span className="badge bg-emerald-50 text-emerald-700">
                          {t("periods.live")}
                        </span>
                      )}
                      {!period.isActive && (
                        <span className="badge bg-ink-100 text-ink-500">
                          {t("periods.disabled")}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-ink-500">
                      <span className="tabular-nums">
                        {period.startTime} – {period.endTime}
                      </span>
                      {length !== null && (
                        <> · {t("periods.minutes", { n: length })}</>
                      )}
                      {" · "}
                      {t("periods.records")}: {period._count.attendance}
                    </p>
                  </div>

                  {canEdit && (
                    <div className="flex items-center gap-2">
                      <form action={togglePeriod}>
                        <input type="hidden" name="id" value={period.id} />
                        <button type="submit" className="btn-secondary btn-sm">
                          {period.isActive
                            ? t("periods.disable")
                            : t("periods.enable")}
                        </button>
                      </form>
                      <form action={deletePeriod}>
                        <input type="hidden" name="id" value={period.id} />
                        <ConfirmSubmit message={t("periods.deleteConfirm")}>
                          {t("periods.delete")}
                        </ConfirmSubmit>
                      </form>
                    </div>
                  )}
                </div>

                {canEdit && (
                  <div className="border-t border-ink-200 px-5 py-4">
                    <ActionForm action={updatePeriod} submitLabel={t("action.save")}>
                      <input type="hidden" name="id" value={period.id} />
                      <div className="grid gap-4 sm:grid-cols-3">
                        <div>
                          <label className="label" htmlFor={`name-${period.id}`}>
                            {t("periods.name")}
                          </label>
                          <input
                            id={`name-${period.id}`}
                            name="name"
                            className="input"
                            defaultValue={period.name}
                            required
                          />
                        </div>
                        <div>
                          <label className="label" htmlFor={`start-${period.id}`}>
                            {t("periods.start")}
                          </label>
                          <input
                            id={`start-${period.id}`}
                            name="startTime"
                            type="time"
                            className="input"
                            defaultValue={period.startTime}
                            required
                          />
                        </div>
                        <div>
                          <label className="label" htmlFor={`end-${period.id}`}>
                            {t("periods.end")}
                          </label>
                          <input
                            id={`end-${period.id}`}
                            name="endTime"
                            type="time"
                            className="input"
                            defaultValue={period.endTime}
                            required
                          />
                        </div>
                      </div>
                    </ActionForm>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
