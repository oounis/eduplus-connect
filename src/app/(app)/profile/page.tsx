import { Avatar, TIER_LABELS, TierBadge, tierFor } from "@/components/kogia";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ActionForm } from "@/components/action-form";
import { Card, PageHeader, RoleBadge } from "@/components/ui";
import { getT } from "@/lib/locale";
import { MODULES } from "@/lib/constants";
import { changeOwnPassword, updateOwnDetails } from "./actions";

export default async function ProfilePage() {
  const user = await requireUser();
  const t = await getT();
  const record = await prisma.user.findUnique({
    where: { id: user.userId },
    select: { firstName: true, lastName: true, email: true, phone: true, createdAt: true },
  });

  const granted = MODULES.filter((key) => user.access[key]?.view);

  return (
    <>
      <PageHeader
        title={t("app.myAccount")}
        description={t("prof.subtitle")}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Card title={t("prof.details")}>
            <div className="flex items-center gap-4 border-b border-ink-200 px-5 py-4">
              <Avatar seed={user.name} size={64} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-semibold text-ink-900">{user.name}</p>
                <p className="text-xs text-ink-500">
                  {t("prof.tierAccount", { tier: TIER_LABELS[tierFor(user.role)] })}
                </p>
              </div>
              <TierBadge role={user.role} size={48} />
            </div>
            <div className="grid gap-4 px-5 py-4 text-sm sm:grid-cols-2">
              <div>
                <p className="text-xs text-ink-500">{t("prof.name")}</p>
                <p className="text-ink-800">
                  {record?.firstName} {record?.lastName}
                </p>
              </div>
              <div>
                <p className="text-xs text-ink-500">{t("common.role")}</p>
                <p>
                  <RoleBadge role={user.role} label={t(`role.${user.role}`)} />
                </p>
              </div>
              <div>
                <p className="text-xs text-ink-500">{t("common.email")}</p>
                <p className="text-ink-800">{record?.email}</p>
              </div>
              <div>
                <p className="text-xs text-ink-500">{t("prof.created")}</p>
                <p className="text-ink-800">
                  {record?.createdAt.toLocaleDateString("en-GB", { timeZone: "UTC" })}
                </p>
              </div>
            </div>
            <div className="border-t border-ink-200 px-5 py-4">
              <ActionForm action={updateOwnDetails} submitLabel={t("prof.saveDetails")}>
                <div className="max-w-xs">
                  <label className="label" htmlFor="phone">{t("common.phone")}</label>
                  <input
                    id="phone"
                    name="phone"
                    className="input"
                    defaultValue={record?.phone ?? ""}
                    placeholder="+973 …"
                  />
                  <p className="mt-1.5 text-xs text-ink-500">
                    {t("prof.managedHint")}
                  </p>
                </div>
              </ActionForm>
            </div>
          </Card>

          <Card title={t("prof.changePassword")}>
            <div className="px-5 py-4">
              <ActionForm action={changeOwnPassword} submitLabel={t("prof.changePassword")} resetOnSuccess>
                <div className="grid max-w-md gap-4">
                  <div>
                    <label className="label" htmlFor="currentPassword">{t("prof.currentPassword")}</label>
                    <input
                      id="currentPassword"
                      name="currentPassword"
                      type="password"
                      className="input"
                      autoComplete="current-password"
                      required
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="newPassword">{t("prof.newPassword")}</label>
                    <input
                      id="newPassword"
                      name="newPassword"
                      type="password"
                      className="input"
                      autoComplete="new-password"
                      minLength={8}
                      required
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="confirmPassword">{t("prof.repeatPassword")}</label>
                    <input
                      id="confirmPassword"
                      name="confirmPassword"
                      type="password"
                      className="input"
                      autoComplete="new-password"
                      minLength={8}
                      required
                    />
                  </div>
                </div>
              </ActionForm>
            </div>
          </Card>
        </div>

        <Card
          title={t("prof.yourAccess")}
          subtitle={`${t(`role.${user.role}`)} · ${t("prof.modulesOf", {
            granted: granted.length,
            total: MODULES.length,
          })}`}
        >
          <ul className="divide-y divide-ink-100">
            {MODULES.map((key) => {
              const rights = user.access[key];
              return (
                <li key={key} className="flex items-center justify-between gap-4 px-5 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink-800">
                      {t(`module.${key}.label`)}
                    </p>
                    <p className="truncate text-xs text-ink-500">
                      {t(`module.${key}.description`)}
                    </p>
                  </div>
                  <span
                    className={`badge shrink-0 ${
                      rights?.edit
                        ? "bg-emerald-50 text-emerald-700"
                        : rights?.view
                          ? "bg-sky-50 text-sky-700"
                          : "bg-ink-100 text-ink-400"
                    }`}
                  >
                    {rights?.edit
                      ? t("action.edit")
                      : rights?.view
                        ? t("prof.view")
                        : t("prof.noAccess")}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </>
  );
}
