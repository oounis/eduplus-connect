import { Fragment } from "react";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { requireModule } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getT } from "@/lib/locale";
import {
  MODULES,
  ROLES,
  type ModuleKey,
  type Role,
} from "@/lib/constants";
import { Card, PageHeader } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { resetAccessMatrix, saveAccessMatrix } from "./actions";

export default async function AccessPage() {
  const user = await requireModule("access");
  const t = await getT();
  const canEdit = user.access.access.edit;

  const rows = await prisma.roleModuleAccess.findMany();
  const grant = (role: Role, moduleKey: ModuleKey) =>
    rows.find((r) => r.role === role && r.module === moduleKey) ?? {
      canView: false,
      canEdit: false,
    };

  return (
    <>
      <PageHeader
        title={t("module.access.label")}
        description={t("acc.subtitle")}
        actions={
          canEdit ? (
            <form action={resetAccessMatrix}>
              <ConfirmSubmit message={t("acc.resetConfirm")}>
                {t("acc.reset")}
              </ConfirmSubmit>
            </form>
          ) : null
        }
      />

      <ActionForm
        action={saveAccessMatrix}
        submitLabel={t("acc.save")}
        className={canEdit ? "" : "pointer-events-none opacity-70"}
      >
        <Card>
          <div className="overflow-x-auto">
            <table className="table">
              {/* Two header rows: the role spans a pair of columns, and
                  "view"/"edit" are named ONCE each. They used to be repeated
                  beside every checkbox — 210 labels on this page — and because
                  the two words are different widths, centring each one
                  separately put their checkboxes at different x positions.
                  That is what made the grid look ragged. Naming them in the
                  header instead fixes the alignment structurally and removes
                  the noise. */}
              <thead>
                <tr>
                  <th rowSpan={2} className="min-w-56 align-bottom">
                    {t("acc.module")}
                  </th>
                  {ROLES.map((role) => (
                    <th
                      key={role}
                      colSpan={2}
                      className="border-s border-ink-200"
                    >
                      {/* Centred on a block inside the cell: `.table thead th`
                          sets text-left through @apply, which wins over a
                          text-center utility on the same element. */}
                      <div className="text-center">{t(`role.${role}`)}</div>
                    </th>
                  ))}
                </tr>
                <tr>
                  {ROLES.map((role) => (
                    <Fragment key={role}>
                      <th className="w-14 border-s border-ink-200 px-0 pb-2 pt-0 text-[10px] font-normal normal-case tracking-normal">
                        <div className="text-center">{t("acc.view")}</div>
                      </th>
                      <th className="w-14 px-0 pb-2 pt-0 text-[10px] font-normal normal-case tracking-normal">
                        <div className="text-center">{t("acc.edit")}</div>
                      </th>
                    </Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MODULES.map((moduleKey) => (
                  <tr key={moduleKey}>
                    <td>
                      <p className="font-medium text-ink-900">
                        {t(`module.${moduleKey}.label`)}
                      </p>
                      <p className="text-xs text-ink-500">
                        {t(`module.${moduleKey}.description`)}
                      </p>
                    </td>
                    {ROLES.map((role) => {
                      const current = grant(role, moduleKey);
                      const moduleLabel = t(`module.${moduleKey}.label`);
                      const roleLabel = t(`role.${role}`);
                      return (
                        <Fragment key={role}>
                          <td className="border-s border-ink-100 px-0 text-center">
                            <input
                              type="checkbox"
                              name={`${role}:${moduleKey}:view`}
                              defaultChecked={current.canView}
                              disabled={!canEdit}
                              // The visible label now lives in the column
                              // header, which a screen reader reading cell by
                              // cell never reaches. Spell it out here.
                              aria-label={`${roleLabel} — ${moduleLabel} — ${t("acc.view")}`}
                              className="h-4 w-4 accent-brand-600"
                            />
                          </td>
                          <td className="px-0 text-center">
                            <input
                              type="checkbox"
                              name={`${role}:${moduleKey}:edit`}
                              defaultChecked={current.canEdit}
                              disabled={!canEdit}
                              aria-label={`${roleLabel} — ${moduleLabel} — ${t("acc.edit")}`}
                              className="h-4 w-4 accent-brand-600"
                            />
                          </td>
                        </Fragment>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </ActionForm>

      <p className="mt-4 text-xs text-ink-500">{t("acc.note")}</p>
    </>
  );
}
