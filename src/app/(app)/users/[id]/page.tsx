import { ConfirmSubmit } from "@/components/confirm-submit";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireModule } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { MODULES, ROLES, type Role } from "@/lib/constants";
import { resolveAccess } from "@/lib/auth";
import { getI18n } from "@/lib/locale";
import { Card, PageHeader, RoleBadge } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { deleteUser, resetPassword, setQuickPin, updateUser } from "../actions";
import { QUICK_PIN_LENGTH } from "@/lib/quick-session";

export default async function EditUserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requireModule("users", "edit");
  const { t } = await getI18n();
  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      supervisedClasses: { include: { class: true } },
      taughtClasses: { include: { class: true } },
      children: true,
    },
  });
  if (!user) notFound();

  const access = await resolveAccess(user.id, user.role as Role);
  const granted = MODULES.filter((m) => access[m].view);

  return (
    <>
      <PageHeader
        title={`${user.firstName} ${user.lastName}`}
        description={user.email}
        actions={
          <Link href="/users" className="btn-secondary btn-sm">
            {t("usr.backToUsers")}
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card title={t("usr.accountDetails")}>
            <div className="px-5 py-4">
              <ActionForm action={updateUser} submitLabel={t("action.saveChanges")}>
                <input type="hidden" name="id" value={user.id} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="label" htmlFor="firstName">{t("common.firstName")}</label>
                    <input
                      id="firstName"
                      name="firstName"
                      className="input"
                      defaultValue={user.firstName}
                      required
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="lastName">{t("common.lastName")}</label>
                    <input
                      id="lastName"
                      name="lastName"
                      className="input"
                      defaultValue={user.lastName}
                      required
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="email">{t("common.email")}</label>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      className="input"
                      defaultValue={user.email}
                      required
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="phone">{t("common.phone")}</label>
                    <input
                      id="phone"
                      name="phone"
                      className="input"
                      defaultValue={user.phone ?? ""}
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="role">{t("common.role")}</label>
                    <select
                      id="role"
                      name="role"
                      className="select"
                      defaultValue={user.role}
                    >
                      {ROLES.map((role) => (
                        <option key={role} value={role}>
                          {t(`role.${role}`)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </ActionForm>
            </div>
          </Card>

          <Card className="mt-6" title={t("usr.resetPassword")}>
            <div className="px-5 py-4">
              <ActionForm
                action={resetPassword}
                submitLabel={t("usr.resetPassword")}
                submitClassName="btn-secondary"
              >
                <input type="hidden" name="id" value={user.id} />
                <label className="label" htmlFor="password">{t("usr.newPassword")}</label>
                <input
                  id="password"
                  name="password"
                  type="text"
                  className="input max-w-xs"
                  minLength={8}
                  placeholder={t("usr.passwordHint")}
                  required
                />
              </ActionForm>
            </div>
          </Card>

          {/* Quick attendance is opt-in per teacher: no PIN, and they do not
              appear on the /quick page at all. */}
          {user.role === "TEACHER" && (
            <Card className="mt-6" title={t("usr.quickPinTitle")}>
              <div className="px-5 py-4">
                <p className="mb-3 text-xs text-ink-500">
                  {t("usr.quickPinIntro", { name: user.firstName })}{" "}
                  <code>/quick</code>{" "}
                  {t("usr.quickPinIntro2")}{" "}
                  {user.quickPin
                    ? t("usr.quickPinSet")
                    : t("usr.quickPinNotSet")}{" "}
                  {t("usr.quickPinOff")}
                </p>
                <ActionForm
                  action={setQuickPin}
                  submitLabel={
                    user.quickPin ? t("usr.replacePin") : t("usr.setPin")
                  }
                  submitClassName="btn-secondary"
                >
                  <input type="hidden" name="id" value={user.id} />
                  <label className="label" htmlFor="pin">
                    {t("usr.pinLabel", { n: QUICK_PIN_LENGTH })}
                  </label>
                  <input
                    id="pin"
                    name="pin"
                    type="text"
                    inputMode="numeric"
                    pattern={`\\d{${QUICK_PIN_LENGTH}}`}
                    maxLength={QUICK_PIN_LENGTH}
                    className="input max-w-xs tracking-[0.3em]"
                    placeholder="482913"
                  />
                </ActionForm>
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card title={t("usr.roleAndAccess")}>
            <div className="space-y-4 px-5 py-4">
              <div>
                <p className="label">{t("usr.currentRole")}</p>
                <RoleBadge role={user.role} />
              </div>
              <div>
                <p className="label">{t("usr.modulesGranted")}</p>
                <ul className="space-y-1">
                  {granted.map((key) => (
                    <li key={key} className="flex items-center justify-between text-sm">
                      <span className="text-ink-700">{t(`module.${key}.label`)}</span>
                      <span className="text-xs text-ink-400">
                        {access[key].edit ? t("usr.viewEdit") : t("usr.view")}
                      </span>
                    </li>
                  ))}
                  {granted.length === 0 && (
                    <li className="text-sm text-ink-500">{t("usr.noModules")}</li>
                  )}
                </ul>
              </div>
              <Link href="/access" className="btn-secondary btn-sm w-full">
                {t("usr.manageAccess")}
              </Link>
            </div>
          </Card>

          {(user.supervisedClasses.length > 0 ||
            user.taughtClasses.length > 0 ||
            user.children.length > 0) && (
            <Card title={t("module.assignments.label")}>
              <div className="space-y-3 px-5 py-4 text-sm">
                {user.supervisedClasses.length > 0 && (
                  <div>
                    <p className="label">{t("usr.supervises")}</p>
                    <p className="text-ink-700">
                      {user.supervisedClasses.map((c) => c.class.name).join(", ")}
                    </p>
                  </div>
                )}
                {user.taughtClasses.length > 0 && (
                  <div>
                    <p className="label">{t("usr.teaches")}</p>
                    <p className="text-ink-700">
                      {user.taughtClasses.map((c) => c.class.name).join(", ")}
                    </p>
                  </div>
                )}
                {user.children.length > 0 && (
                  <div>
                    <p className="label">{t("usr.children")}</p>
                    <p className="text-ink-700">
                      {user.children
                        .map((c) => `${c.firstName} ${c.lastName}`)
                        .join(", ")}
                    </p>
                  </div>
                )}
              </div>
            </Card>
          )}

          {user.id !== actor.userId && (
            <Card title={t("usr.dangerZone")}>
              <div className="px-5 py-4">
                <p className="mb-3 text-xs text-ink-500">
                  {t("usr.deleteWarning")}
                </p>
                <form action={deleteUser}>
                  <input type="hidden" name="id" value={user.id} />
                  <ConfirmSubmit
                    className="btn-danger btn-sm"
                    message={t("usr.deleteConfirm", {
                      name: `${user.firstName} ${user.lastName}`,
                    })}
                  >
                    {t("usr.deleteUser")}
                  </ConfirmSubmit>
                </form>
              </div>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
