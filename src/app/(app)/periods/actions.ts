"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { assertModule } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { getT } from "@/lib/locale";
import { parseHHMM, periodsOverlap } from "@/lib/school-time";

export type ActionState = { error?: string; success?: string };

const periodSchema = z.object({
  name: z.string().trim().min(1),
  startTime: z.string().trim(),
  endTime: z.string().trim(),
});

/**
 * Shared validation for create and update. A timetable that overlaps itself
 * would make two periods "live" at once and the whole current-period rule
 * meaningless, so overlap is rejected here rather than tidied up later.
 */
async function validate(
  input: { name: string; startTime: string; endTime: string },
  t: Awaited<ReturnType<typeof getT>>,
  ignoreId?: string,
): Promise<string | null> {
  const start = parseHHMM(input.startTime);
  const end = parseHHMM(input.endTime);
  if (start === null || end === null) return t("periods.badTime");
  if (end <= start) return t("periods.endBeforeStart");

  const clash = await prisma.period.findFirst({
    where: { name: input.name, ...(ignoreId ? { id: { not: ignoreId } } : {}) },
  });
  if (clash) return t("periods.nameTaken");

  const others = await prisma.period.findMany({
    where: ignoreId ? { id: { not: ignoreId } } : {},
  });
  const overlapping = others.find((other) =>
    periodsOverlap({ ...input, id: "", isActive: true }, other),
  );
  if (overlapping) {
    return t("periods.overlap", {
      name: overlapping.name,
      start: overlapping.startTime,
      end: overlapping.endTime,
    });
  }
  return null;
}

export async function createPeriod(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await assertModule("periods");
  const t = await getT();

  const parsed = periodSchema.safeParse({
    name: formData.get("name"),
    startTime: formData.get("startTime"),
    endTime: formData.get("endTime"),
  });
  if (!parsed.success) return { error: t("periods.badTime") };

  const problem = await validate(parsed.data, t);
  if (problem) return { error: problem };

  const period = await prisma.period.create({ data: parsed.data });
  await recordAudit(actor, {
    action: "CREATE",
    entity: "period",
    entityId: period.id,
    summary: `Added period ${period.name} (${period.startTime}–${period.endTime})`,
  });

  revalidatePath("/periods");
  revalidatePath("/period-attendance");
  return { success: t("periods.created", { name: period.name }) };
}

export async function updatePeriod(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await assertModule("periods");
  const t = await getT();

  const id = String(formData.get("id") ?? "");
  const parsed = periodSchema.safeParse({
    name: formData.get("name"),
    startTime: formData.get("startTime"),
    endTime: formData.get("endTime"),
  });
  if (!id || !parsed.success) return { error: t("periods.badTime") };

  const before = await prisma.period.findUnique({ where: { id } });
  if (!before) return { error: t("periods.notFound") };

  const problem = await validate(parsed.data, t, id);
  if (problem) return { error: problem };

  const period = await prisma.period.update({ where: { id }, data: parsed.data });
  await recordAudit(actor, {
    action: "UPDATE",
    entity: "period",
    entityId: id,
    summary:
      `Changed period ${before.name} (${before.startTime}–${before.endTime})` +
      ` to ${period.name} (${period.startTime}–${period.endTime})`,
  });

  revalidatePath("/periods");
  revalidatePath("/period-attendance");
  return { success: t("periods.updated", { name: period.name }) };
}

/** Takes a period out of use without losing the records taken in it. */
export async function togglePeriod(formData: FormData) {
  const actor = await assertModule("periods");
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const period = await prisma.period.findUnique({ where: { id } });
  if (!period) return;

  await prisma.period.update({
    where: { id },
    data: { isActive: !period.isActive },
  });
  await recordAudit(actor, {
    action: "UPDATE",
    entity: "period",
    entityId: id,
    summary: `${period.isActive ? "Took" : "Put"} period ${period.name} ${period.isActive ? "out of" : "into"} use`,
  });

  revalidatePath("/periods");
  revalidatePath("/period-attendance");
}

export async function deletePeriod(formData: FormData) {
  const actor = await assertModule("periods");
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const period = await prisma.period.findUnique({
    where: { id },
    include: { _count: { select: { attendance: true } } },
  });
  if (!period) return;

  await prisma.period.delete({ where: { id } });
  await recordAudit(actor, {
    action: "DELETE",
    entity: "period",
    entityId: id,
    summary:
      `Deleted period ${period.name} (${period.startTime}–${period.endTime})` +
      ` and its ${period._count.attendance} attendance record(s)`,
  });

  revalidatePath("/periods");
  revalidatePath("/period-attendance");
}
