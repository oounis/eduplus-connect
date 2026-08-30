import { Avatar } from "@/components/kogia";
import { ConfirmSubmit } from "@/components/confirm-submit";
import Link from "next/link";
import { requireModule } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ROLES, type Role } from "@/lib/constants";
import { getI18n } from "@/lib/locale";
import { Card, EmptyState, PageHeader, RoleBadge } from "@/components/ui";
import { ActionForm, Disclosure } from "@/components/action-form";
import { createUser, toggleUserActive } from "./actions";

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string; q?: string }>;
}) {
  const user = await requireModule("users");
  const { t } = await getI18n();
  const params = await searchParams;
  const roleFilter = ROLES.includes(params.role as Role)
    ? (params.role as Role)
    : undefined;
  const query = params.q?.trim() ?? "";

  const users = await prisma.user.findMany({
    where: {
      ...(roleFilter ? { role: roleFilter } : {}),
      // `mode: "insensitive"` is required on Postgres: unlike SQLite, LIKE is
      // case-sensitive there, so without it searching "ahmed" would not find
      // "Ahmed" — a silent regression, since the query still succeeds.
      ...(query
        ? {
            OR: [
              { firstName: { contains: query, mode: "insensitive" as const } },
              { lastName: { contains: query, mode: "insensitive" as const } },
              { email: { contains: query, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    orderBy: [{ role: "asc" }, { lastName: "asc" }],
  });

  const counts = await prisma.user.groupBy({
    by: ["role"],
    _count: { _all: true },
  });
  const countFor = (role: Role) =>
    counts.find((c) => c.role === role)?._count._all ?? 0;

  return (
    <>
      <PageHeader
        title={t("module.users.label")}
        description={t("usr.subtitle")}
      />

      {/* Role filter */}
      <div className="mb-5 flex flex-wrap gap-2">
        <Link
          href="/users"
          className={`badge border px-3 py-1 ${
            !roleFilter
              ? "border-brand-200 bg-brand-50 text-brand-700"
              : "border-ink-200 bg-white text-ink-600 hover:bg-ink-50"
          }`}
        >
          {t("common.all")} ({users.length === 0 && !roleFilter ? 0 : counts.reduce((a, c) => a + c._count._all, 0)})
        </Link>
        {ROLES.map((role) => (
          <Link
            key={role}
            href={`/users?role=${role}`}
            className={`badge border px-3 py-1 ${
              roleFilter === role
                ? "border-brand-200 bg-brand-50 text-brand-700"
                : "border-ink-200 bg-white text-ink-600 hover:bg-ink-50"
            }`}
          >
            {t(`role.${role}`)} ({countFor(role)})
          </Link>
        ))}
      </div>

      {user.access.users.edit && (
        <div className="mb-6">
          <Disclosure label={t("usr.add")}>
            <ActionForm action={createUser} submitLabel={t("usr.create")} resetOnSuccess>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="firstName">{t("common.firstName")}</label>
                  <input id="firstName" name="firstName" className="input" required />
                </div>
                <div>
                  <label className="label" htmlFor="lastName">{t("common.lastName")}</label>
                  <input id="lastName" name="lastName" className="input" required />
                </div>
                <div>
                  <label className="label" htmlFor="email">{t("common.email")}</label>
                  <input id="email" name="email" type="email" className="input" required />
                </div>
                <div>
                  <label className="label" htmlFor="phone">{t("usr.phoneOptional")}</label>
                  <input id="phone" name="phone" className="input" />
                </div>
                <div>
                  <label className="label" htmlFor="role">{t("common.role")}</label>
                  <select id="role" name="role" className="select" defaultValue="TEACHER">
                    {ROLES.map((role) => (
                      <option key={role} value={role}>
                        {t(`role.${role}`)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="password">{t("usr.tempPassword")}</label>
                  <input
                    id="password"
                    name="password"
                    type="text"
                    className="input"
                    minLength={8}
                    // No default in production: a shared, published default
                    // password is the account every new user forgets to
                    // change. Whoever creates the account chooses one.
                    defaultValue={
                      process.env.NODE_ENV !== "production" ? "Passw0rd!" : undefined
                    }
                    required
                  />
                </div>
              </div>
            </ActionForm>
          </Disclosure>
        </div>
      )}

      <Card
        title={
          users.length === 1
            ? t("usr.nAccount", { n: users.length })
            : t("usr.nAccounts", { n: users.length })
        }
        subtitle={
          roleFilter
            ? t("usr.filteredBy", { role: t(`role.${roleFilter}`) })
            : t("usr.allRoles")
        }
      >
        {users.length === 0 ? (
          <EmptyState>{t("usr.empty")}</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>{t("periods.name")}</th>
                  <th>{t("common.email")}</th>
                  <th>{t("common.role")}</th>
                  <th>{t("common.status")}</th>
                  <th className="text-end">{t("common.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {users.map((row) => (
                  <tr key={row.id}>
                    <td className="font-medium text-ink-900">
                      <span className="flex items-center gap-2.5">
                        <Avatar seed={`${row.firstName} ${row.lastName}`} size={30} />
                        <span>
                          {row.firstName} {row.lastName}
                          {row.id === user.userId && (
                            <span className="ms-2 text-xs text-ink-400">{t("usr.you")}</span>
                          )}
                        </span>
                      </span>
                    </td>
                    <td className="text-ink-600">{row.email}</td>
                    <td><RoleBadge role={row.role} /></td>
                    <td>
                      {row.isActive ? (
                        <span className="badge bg-emerald-50 text-emerald-700">{t("common.active")}</span>
                      ) : (
                        <span className="badge bg-ink-100 text-ink-500">{t("usr.disabled")}</span>
                      )}
                    </td>
                    <td>
                      <div className="flex justify-end gap-2">
                        {user.access.users.edit && (
                          <>
                            <Link href={`/users/${row.id}`} className="btn-secondary btn-sm">
                              {t("action.edit")}
                            </Link>
                            {row.id !== user.userId && (
                              <form action={toggleUserActive}>
                                <input type="hidden" name="id" value={row.id} />
                                {row.isActive ? (
                                  <ConfirmSubmit
                                    message={t("usr.disableConfirm", {
                                      name: `${row.firstName} ${row.lastName}`,
                                    })}
                                  >
                                    {t("usr.disable")}
                                  </ConfirmSubmit>
                                ) : (
                                  <button type="submit" className="btn-secondary btn-sm">
                                    {t("usr.enable")}
                                  </button>
                                )}
                              </form>
                            )}
                          </>
                        )}
                      </div>
                    </td>
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
