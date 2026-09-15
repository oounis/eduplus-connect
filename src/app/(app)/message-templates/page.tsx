import { requireModule } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getI18n } from "@/lib/locale";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { ActionForm, Disclosure } from "@/components/action-form";
import { saveTemplate, toggleTemplate } from "./actions";

/**
 * Message templates — written by an administrator, used by supervisors.
 *
 * Supervisors reach /student-data without an email login and build the message
 * file for families from there. Before this page, each of them composed that
 * text from scratch every time, which is how a school ends up sending three
 * differently worded versions of the same notice. The administrator writes it
 * once here; the supervisor picks it from a list.
 *
 * It lives behind the `students` module rather than a module of its own, so no
 * administrator has to be granted anything new for it to appear.
 */
export default async function MessageTemplatesPage() {
  const user = await requireModule("students");
  const { t } = await getI18n();
  const canEdit = user.access.students.edit;

  const templates = await prisma.messageTemplate.findMany({
    orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
  });

  const modeLabel = (mode: string) =>
    mode === "GENERAL" ? t("mt.general") : t("mt.named");

  return (
    <>
      <PageHeader title={t("mt.title")} description={t("mt.subtitle")} />

      {canEdit && (
        <div className="mb-6">
          <Disclosure label={t("mt.add")}>
            <ActionForm
              action={saveTemplate}
              submitLabel={t("mt.create")}
              resetOnSuccess
            >
              <div className="space-y-4">
                <div>
                  <label className="label" htmlFor="title">
                    {t("mt.name")}
                  </label>
                  <input
                    id="title"
                    name="title"
                    className="input"
                    maxLength={80}
                    placeholder={t("mt.namePlaceholder")}
                    required
                  />
                </div>

                <fieldset>
                  <legend className="label">{t("mt.type")}</legend>
                  <div className="space-y-2">
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-800">
                      <input
                        type="radio"
                        name="mode"
                        value="NAMED"
                        defaultChecked
                        className="h-4 w-4 accent-brand-600"
                      />
                      {t("mt.namedHint")}
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-800">
                      <input
                        type="radio"
                        name="mode"
                        value="GENERAL"
                        className="h-4 w-4 accent-brand-600"
                      />
                      {t("mt.generalHint")}
                    </label>
                  </div>
                </fieldset>

                <div>
                  <label className="label" htmlFor="body">
                    {t("mt.body")}
                  </label>
                  <textarea
                    id="body"
                    name="body"
                    rows={3}
                    className="input"
                    maxLength={1000}
                    placeholder={t("mt.bodyPlaceholder")}
                    required
                  />
                </div>
              </div>
            </ActionForm>
          </Disclosure>
        </div>
      )}

      <Card>
        {templates.length === 0 ? (
          <EmptyState>
            {t("mt.none")} {t("mt.noneHint")}
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>{t("mt.name")}</th>
                  <th>{t("mt.type")}</th>
                  <th>{t("mt.body")}</th>
                  <th>{t("common.status")}</th>
                  {canEdit && <th />}
                </tr>
              </thead>
              <tbody>
                {templates.map((template) => (
                  <tr
                    key={template.id}
                    className={template.isActive ? "" : "opacity-60"}
                  >
                    <td className="whitespace-nowrap font-medium text-ink-900">
                      {template.title}
                    </td>
                    <td className="whitespace-nowrap text-xs text-ink-600">
                      {modeLabel(template.mode)}
                    </td>
                    <td className="max-w-md text-xs text-ink-600">
                      {template.body}
                    </td>
                    <td>
                      {template.isActive ? (
                        <span className="badge bg-emerald-50 text-emerald-700">
                          {t("mt.active")}
                        </span>
                      ) : (
                        <span className="badge bg-ink-100 text-ink-600">
                          {t("mt.retiredBadge")}
                        </span>
                      )}
                    </td>
                    {canEdit && (
                      <td className="whitespace-nowrap">
                        <ActionForm
                          action={toggleTemplate}
                          submitLabel={
                            template.isActive ? t("mt.retire") : t("mt.restore")
                          }
                          submitClassName="btn-secondary btn-sm"
                        >
                          <input type="hidden" name="id" value={template.id} />
                        </ActionForm>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
