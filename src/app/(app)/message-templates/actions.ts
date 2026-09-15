"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { assertModule } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { getT } from "@/lib/locale";

export type TemplateState = { error?: string; success?: string };

const MAX_TITLE = 80;
const MAX_BODY = 1000;

/** "NAMED" prefixes the child's name when the file is built; "GENERAL" does not. */
function readMode(value: FormDataEntryValue | null): "NAMED" | "GENERAL" {
  return String(value ?? "") === "GENERAL" ? "GENERAL" : "NAMED";
}

function readText(form: FormData, field: string, limit: number) {
  return String(form.get(field) ?? "")
    .trim()
    .slice(0, limit);
}

export async function saveTemplate(
  _prev: TemplateState,
  formData: FormData,
): Promise<TemplateState> {
  const actor = await assertModule("students");
  const t = await getT();

  const id = String(formData.get("id") ?? "").trim();
  const title = readText(formData, "title", MAX_TITLE);
  const body = readText(formData, "body", MAX_BODY);
  const mode = readMode(formData.get("mode"));

  if (!title || !body) return { error: t("mt.needBoth") };

  if (id) {
    const existing = await prisma.messageTemplate.findUnique({ where: { id } });
    if (!existing) return { error: t("mt.gone") };
    await prisma.messageTemplate.update({
      where: { id },
      data: { title, body, mode },
    });
    await recordAudit(actor, {
      action: "UPDATE",
      entity: "messageTemplate",
      entityId: id,
      summary: `Updated message template "${title}"`,
    });
  } else {
    const created = await prisma.messageTemplate.create({
      data: { title, body, mode },
    });
    await recordAudit(actor, {
      action: "CREATE",
      entity: "messageTemplate",
      entityId: created.id,
      summary: `Created message template "${title}"`,
    });
  }

  revalidatePath("/message-templates");
  return { success: t("mt.saved") };
}

/**
 * Retires or restores a template.
 *
 * Never deleted: a supervisor may already have sent this text to three hundred
 * families, and the audit trail has to keep pointing at something. Retiring it
 * only takes it out of the supervisor's list.
 */
export async function toggleTemplate(
  _prev: TemplateState,
  formData: FormData,
): Promise<TemplateState> {
  const actor = await assertModule("students");
  const t = await getT();

  const id = String(formData.get("id") ?? "").trim();
  const existing = await prisma.messageTemplate.findUnique({ where: { id } });
  if (!existing) return { error: t("mt.gone") };

  await prisma.messageTemplate.update({
    where: { id },
    data: { isActive: !existing.isActive },
  });
  await recordAudit(actor, {
    action: "UPDATE",
    entity: "messageTemplate",
    entityId: id,
    summary: `${existing.isActive ? "Retired" : "Restored"} message template "${existing.title}"`,
  });

  revalidatePath("/message-templates");
  return { success: existing.isActive ? t("mt.retired") : t("mt.restored") };
}
