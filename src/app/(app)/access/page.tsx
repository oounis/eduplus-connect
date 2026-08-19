import { requireModule } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  MODULES,
  MODULE_META,
  ROLES,
  ROLE_LABELS,
  type ModuleKey,
  type Role,
} from "@/lib/constants";
import { Card, PageHeader } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { resetAccessMatrix, saveAccessMatrix } from "./actions";

export default async function AccessPage() {
  const user = await requireModule("access");
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
        title="Access rights"
        description="Choose which modules each role can open, and which it can change. Edit implies view."
        actions={
          canEdit ? (
            <form action={resetAccessMatrix}>
              <button type="submit" className="btn-secondary btn-sm">
                Reset to defaults
              </button>
            </form>
          ) : null
        }
      />

      <ActionForm
        action={saveAccessMatrix}
        submitLabel="Save access rights"
        className={canEdit ? "" : "pointer-events-none opacity-70"}
      >
        <Card>
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th className="min-w-56">Module</th>
                  {ROLES.map((role) => (
                    <th key={role} className="text-center">
                      {ROLE_LABELS[role]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MODULES.map((moduleKey) => (
                  <tr key={moduleKey}>
                    <td>
                      <p className="font-medium text-ink-900">
                        {MODULE_META[moduleKey].label}
                      </p>
                      <p className="text-xs text-ink-500">
                        {MODULE_META[moduleKey].description}
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
                              view
                            </label>
                            <label className="flex items-center gap-1 text-[11px] text-ink-500">
                              <input
                                type="checkbox"
                                name={`${role}:${moduleKey}:edit`}
                                defaultChecked={current.canEdit}
                                disabled={!canEdit}
                                className="h-3.5 w-3.5 accent-brand-600"
                              />
                              edit
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

      <p className="mt-4 text-xs text-ink-500">
        Changes apply the next time each user loads a page. Administrators keep
        edit rights on Users and Access rights so the matrix can always be
        undone.
      </p>
    </>
  );
}
