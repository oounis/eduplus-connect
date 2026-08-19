import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ActionForm } from "@/components/action-form";
import { Card, PageHeader, RoleBadge } from "@/components/ui";
import { MODULES, MODULE_META, ROLE_LABELS } from "@/lib/constants";
import { changeOwnPassword, updateOwnDetails } from "./actions";

export default async function ProfilePage() {
  const user = await requireUser();
  const record = await prisma.user.findUnique({
    where: { id: user.userId },
    select: { firstName: true, lastName: true, email: true, phone: true, createdAt: true },
  });

  const granted = MODULES.filter((key) => user.access[key]?.view);

  return (
    <>
      <PageHeader
        title="My account"
        description="Your details, your password and what you have access to"
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Card title="Details">
            <div className="grid gap-4 px-5 py-4 text-sm sm:grid-cols-2">
              <div>
                <p className="text-xs text-ink-500">Name</p>
                <p className="text-ink-800">
                  {record?.firstName} {record?.lastName}
                </p>
              </div>
              <div>
                <p className="text-xs text-ink-500">Role</p>
                <p><RoleBadge role={user.role} /></p>
              </div>
              <div>
                <p className="text-xs text-ink-500">Email</p>
                <p className="text-ink-800">{record?.email}</p>
              </div>
              <div>
                <p className="text-xs text-ink-500">Account created</p>
                <p className="text-ink-800">
                  {record?.createdAt.toLocaleDateString("en-GB", { timeZone: "UTC" })}
                </p>
              </div>
            </div>
            <div className="border-t border-ink-200 px-5 py-4">
              <ActionForm action={updateOwnDetails} submitLabel="Save details">
                <div className="max-w-xs">
                  <label className="label" htmlFor="phone">Phone</label>
                  <input
                    id="phone"
                    name="phone"
                    className="input"
                    defaultValue={record?.phone ?? ""}
                    placeholder="+973 …"
                  />
                  <p className="mt-1.5 text-xs text-ink-500">
                    Your name, email and role are managed by an administrator.
                  </p>
                </div>
              </ActionForm>
            </div>
          </Card>

          <Card title="Change password">
            <div className="px-5 py-4">
              <ActionForm action={changeOwnPassword} submitLabel="Change password" resetOnSuccess>
                <div className="grid max-w-md gap-4">
                  <div>
                    <label className="label" htmlFor="currentPassword">Current password</label>
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
                    <label className="label" htmlFor="newPassword">New password</label>
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
                    <label className="label" htmlFor="confirmPassword">Repeat new password</label>
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
          title="Your access"
          subtitle={`${ROLE_LABELS[user.role]} · ${granted.length} of ${MODULES.length} modules`}
        >
          <ul className="divide-y divide-ink-100">
            {MODULES.map((key) => {
              const rights = user.access[key];
              return (
                <li key={key} className="flex items-center justify-between gap-4 px-5 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink-800">
                      {MODULE_META[key].label}
                    </p>
                    <p className="truncate text-xs text-ink-500">
                      {MODULE_META[key].description}
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
                    {rights?.edit ? "Edit" : rights?.view ? "View" : "No access"}
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
