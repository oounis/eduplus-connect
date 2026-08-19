import Link from "next/link";
import { notFound } from "next/navigation";
import { requireModule } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { MODULES, MODULE_META, ROLES, ROLE_LABELS, type Role } from "@/lib/constants";
import { resolveAccess } from "@/lib/auth";
import { Card, PageHeader, RoleBadge } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { deleteUser, resetPassword, updateUser } from "../actions";

export default async function EditUserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requireModule("users", "edit");
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
            Back to users
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card title="Account details">
            <div className="px-5 py-4">
              <ActionForm action={updateUser} submitLabel="Save changes">
                <input type="hidden" name="id" value={user.id} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="label" htmlFor="firstName">First name</label>
                    <input
                      id="firstName"
                      name="firstName"
                      className="input"
                      defaultValue={user.firstName}
                      required
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="lastName">Last name</label>
                    <input
                      id="lastName"
                      name="lastName"
                      className="input"
                      defaultValue={user.lastName}
                      required
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="email">Email</label>
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
                    <label className="label" htmlFor="phone">Phone</label>
                    <input
                      id="phone"
                      name="phone"
                      className="input"
                      defaultValue={user.phone ?? ""}
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="role">Role</label>
                    <select
                      id="role"
                      name="role"
                      className="select"
                      defaultValue={user.role}
                    >
                      {ROLES.map((role) => (
                        <option key={role} value={role}>
                          {ROLE_LABELS[role]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </ActionForm>
            </div>
          </Card>

          <Card className="mt-6" title="Reset password">
            <div className="px-5 py-4">
              <ActionForm
                action={resetPassword}
                submitLabel="Reset password"
                submitClassName="btn-secondary"
              >
                <input type="hidden" name="id" value={user.id} />
                <label className="label" htmlFor="password">New password</label>
                <input
                  id="password"
                  name="password"
                  type="text"
                  className="input max-w-xs"
                  minLength={8}
                  placeholder="At least 8 characters"
                  required
                />
              </ActionForm>
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Role and access">
            <div className="space-y-4 px-5 py-4">
              <div>
                <p className="label">Current role</p>
                <RoleBadge role={user.role} />
              </div>
              <div>
                <p className="label">Modules granted by this role</p>
                <ul className="space-y-1">
                  {granted.map((key) => (
                    <li key={key} className="flex items-center justify-between text-sm">
                      <span className="text-ink-700">{MODULE_META[key].label}</span>
                      <span className="text-xs text-ink-400">
                        {access[key].edit ? "view + edit" : "view"}
                      </span>
                    </li>
                  ))}
                  {granted.length === 0 && (
                    <li className="text-sm text-ink-500">No modules granted.</li>
                  )}
                </ul>
              </div>
              <Link href="/access" className="btn-secondary btn-sm w-full">
                Manage access rights
              </Link>
            </div>
          </Card>

          {(user.supervisedClasses.length > 0 ||
            user.taughtClasses.length > 0 ||
            user.children.length > 0) && (
            <Card title="Assignments">
              <div className="space-y-3 px-5 py-4 text-sm">
                {user.supervisedClasses.length > 0 && (
                  <div>
                    <p className="label">Supervises</p>
                    <p className="text-ink-700">
                      {user.supervisedClasses.map((c) => c.class.name).join(", ")}
                    </p>
                  </div>
                )}
                {user.taughtClasses.length > 0 && (
                  <div>
                    <p className="label">Teaches</p>
                    <p className="text-ink-700">
                      {user.taughtClasses.map((c) => c.class.name).join(", ")}
                    </p>
                  </div>
                )}
                {user.children.length > 0 && (
                  <div>
                    <p className="label">Children</p>
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
            <Card title="Danger zone">
              <div className="px-5 py-4">
                <p className="mb-3 text-xs text-ink-500">
                  Deleting removes the account and everything linked to it.
                  Disabling the account is usually the safer option.
                </p>
                <form action={deleteUser}>
                  <input type="hidden" name="id" value={user.id} />
                  <button type="submit" className="btn-danger btn-sm">
                    Delete this user
                  </button>
                </form>
              </div>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
