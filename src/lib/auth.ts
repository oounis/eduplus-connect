import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { SESSION_COOKIE, verifySession, type SessionPayload } from "./session";
import type { ModuleKey, Role } from "./constants";
import { MODULES } from "./constants";

export type ModuleRights = { view: boolean; edit: boolean };
export type AccessMap = Record<ModuleKey, ModuleRights>;

export type CurrentUser = SessionPayload & {
  access: AccessMap;
  isActive: boolean;
};

/** Reads the session cookie. Returns null when signed out. */
export async function getSession(): Promise<SessionPayload | null> {
  const jar = await cookies();
  return verifySession(jar.get(SESSION_COOKIE)?.value);
}

/**
 * Resolves effective module rights: the role grant, with per-user overrides
 * applied on top. Missing rows mean "no access".
 */
export async function resolveAccess(
  userId: string,
  role: Role,
): Promise<AccessMap> {
  const [roleRows, userRows] = await Promise.all([
    prisma.roleModuleAccess.findMany({ where: { role } }),
    prisma.userModuleAccess.findMany({ where: { userId } }),
  ]);

  const access = Object.fromEntries(
    MODULES.map((m) => [m, { view: false, edit: false }]),
  ) as AccessMap;

  for (const row of roleRows) {
    if (!(row.module in access)) continue;
    access[row.module as ModuleKey] = {
      view: row.canView,
      edit: row.canEdit,
    };
  }
  for (const row of userRows) {
    if (!(row.module in access)) continue;
    const current = access[row.module as ModuleKey];
    access[row.module as ModuleKey] = {
      view: row.canView ?? current.view,
      edit: row.canEdit ?? current.edit,
    };
  }
  // An edit right without a view right is meaningless — normalise it.
  for (const key of MODULES) {
    if (access[key].edit) access[key].view = true;
  }
  return access;
}

/** The signed-in user with resolved rights, or null. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await getSession();
  if (!session) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, isActive: true, role: true },
  });
  if (!user || !user.isActive) return null;

  const role = user.role as Role;
  return {
    ...session,
    role,
    isActive: user.isActive,
    access: await resolveAccess(user.id, role),
  };
}

/** Use in every protected page: redirects to /login when signed out. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Use in pages: 403 page when the module is not granted. */
export async function requireModule(
  moduleKey: ModuleKey,
  mode: "view" | "edit" = "view",
): Promise<CurrentUser> {
  const user = await requireUser();
  if (!user.access[moduleKey]?.[mode]) redirect("/denied");
  return user;
}

/** Use inside server actions: throws instead of redirecting. */
export async function assertModule(
  moduleKey: ModuleKey,
  mode: "view" | "edit" = "edit",
): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not signed in");
  if (!user.access[moduleKey]?.[mode]) {
    throw new Error(`Not allowed to ${mode} ${moduleKey}`);
  }
  return user;
}

/** Roles that see school-wide summaries rather than just their own classes. */
export function isSchoolWide(role: Role): boolean {
  return role === "ADMIN" || role === "DEPUTY" || role === "STAFF";
}
