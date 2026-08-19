import { prisma } from "./db";
import type { CurrentUser } from "./auth";

export type AuditAction =
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "ASSIGN"
  | "RESET"
  | "IMPORT";

export const AUDIT_ENTITIES = [
  "user",
  "student",
  "class",
  "year",
  "term",
  "access",
  "assignment",
  "task",
  "attendance",
  "observation",
] as const;
export type AuditEntity = (typeof AUDIT_ENTITIES)[number];

/**
 * Writes one line of history. Never throws into the caller: an action that
 * succeeded must not be reported as failed because the trail could not be
 * written.
 */
export async function recordAudit(
  actor: Pick<CurrentUser, "userId" | "name" | "role">,
  event: {
    action: AuditAction;
    entity: AuditEntity;
    entityId?: string | null;
    summary: string;
  },
): Promise<void> {
  try {
    await prisma.auditEvent.create({
      data: {
        actorId: actor.userId,
        actorName: actor.name,
        actorRole: actor.role,
        action: event.action,
        entity: event.entity,
        entityId: event.entityId ?? null,
        summary: event.summary,
      },
    });
  } catch (error) {
    console.error("audit write failed", error);
  }
}
