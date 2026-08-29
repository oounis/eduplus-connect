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
              <thead>
                <tr>
                  <th className="min-w-56">{t("acc.module")}</th>
                  {ROLES.map((role) => (
                    <th key={role} className="text-center">
                      {t(`role.${role}`)}
                    </th>
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
                      return (
                        <td key={role} className="text-center">
                          <div className="flex flex-col items-center gap-1">
                            <label className="flex items-center gap-1 text-[11px] text-ink-500">
                              <input
                                type="checkbox"
                                name={`${role}:${moduleKey}:view`}
                                defaultChecked={current.canView}
                                disabled={!canEdit}
                                className="h-3.5 w-3.5 accent-brand-600"
                              />
                              {t("acc.view")}
                            </label>
                            <label className="flex items-center gap-1 text-[11px] text-ink-500">
                              <input
                                type="checkbox"
                                name={`${role}:${moduleKey}:edit`}
                                defaultChecked={current.canEdit}
                                disabled={!canEdit}
                                className="h-3.5 w-3.5 accent-brand-600"
                              />
                              {t("acc.edit")}
                            </label>
                          </div>
                        </td>
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
