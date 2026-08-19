"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { assertModule } from "@/lib/auth";
import {
  DEFAULT_ROLE_ACCESS,
  MODULES,
  ROLES,
  type ModuleKey,
  type Role,
} from "@/lib/constants";

export type ActionState = { error?: string; success?: string };

/**
 * Saves the whole role/module matrix in one submit. Checkbox fields are named
 * "<role>:<module>:view" / ":edit" and only appear when checked.
 */
export async function saveAccessMatrix(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await assertModule("access");

  const updates: {
    role: Role;
    module: ModuleKey;
    canView: boolean;
    canEdit: boolean;
  }[] = [];

  for (const role of ROLES) {
    for (const moduleKey of MODULES) {
      const canEdit = formData.get(`${role}:${moduleKey}:edit`) === "on";
      // Edit implies view — keeps the resolved rights consistent.
      const canView =
        canEdit || formData.get(`${role}:${moduleKey}:view`) === "on";
      updates.push({ role, module: moduleKey, canView, canEdit });
    }
  }

  // The admin must keep both users and access, otherwise nobody can undo this.
  const adminUsers = updates.find(
    (u) => u.role === "ADMIN" && u.module === "users",
  );
  const adminAccess = updates.find(
    (u) => u.role === "ADMIN" && u.module === "access",
  );
  if (!adminUsers?.canEdit || !adminAccess?.canEdit) {
    return {
      error:
        "Administrators must keep edit rights on Users and Access rights — otherwise no one could undo the change.",
    };
  }

  await prisma.$transaction(
    updates.map((u) =>
      prisma.roleModuleAccess.upsert({
        where: { role_module: { role: u.role, module: u.module } },
        update: { canView: u.canView, canEdit: u.canEdit },
        create: u,
      }),
    ),
  );

  revalidatePath("/access");
  revalidatePath("/dashboard");
  return { success: "Access rights saved" };
}

export async function resetAccessMatrix(): Promise<void> {
  await assertModule("access");

  await prisma.$transaction(
    ROLES.flatMap((role) =>
      MODULES.map((moduleKey) => {
        const grant = DEFAULT_ROLE_ACCESS[role][moduleKey];
        const data = {
          role,
          module: moduleKey,
          canView: grant?.view ?? false,
          canEdit: grant?.edit ?? false,
        };
        return prisma.roleModuleAccess.upsert({
          where: { role_module: { role, module: moduleKey } },
          update: { canView: data.canView, canEdit: data.canEdit },
          create: data,
        });
      }),
    ),
  );

  revalidatePath("/access");
  revalidatePath("/dashboard");
}
