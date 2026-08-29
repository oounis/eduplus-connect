import { requireModule } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getCurrentYear } from "@/lib/queries";
import { getI18n } from "@/lib/locale";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { saveAssignments } from "./actions";

export default async function AssignmentsPage() {
  const user = await requireModule("assignments");
  const { t } = await getI18n();
  const canEdit = user.access.assignments.edit;

  const year = await getCurrentYear();
  const classes = year
    ? await prisma.class.findMany({
        where: { academicYearId: year.id },
        orderBy: { name: "asc" },
      })
    : [];

  const [supervisors, teachers] = await Promise.all([
    prisma.user.findMany({
      where: { role: "SUPERVISOR", isActive: true },
      orderBy: { lastName: "asc" },
      include: { supervisedClasses: true },
    }),
    prisma.user.findMany({
      where: { role: "TEACHER", isActive: true },
      orderBy: { lastName: "asc" },
      include: { taughtClasses: true },
    }),
  ]);

  const unsupervised = classes.filter(
    (klass) =>
      !supervisors.some((s) =>
        s.supervisedClasses.some((c) => c.classId === klass.id),
      ),
  );

  return (
    <>
      <PageHeader
        title={t("module.assignments.label")}
        description={t("asg.subtitle", {
          year: year?.name ?? t("asg.currentYearFallback"),
        })}
      />

      {classes.length === 0 ? (
        <Card>
          <EmptyState>
            {t("asg.empty")}
          </EmptyState>
        </Card>
      ) : (
        <>
          {unsupervised.length > 0 && (
            <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
              <p className="text-sm font-medium text-amber-900">
                {unsupervised.length === 1
                  ? t("asg.oneClassNoSupervisor", { n: unsupervised.length })
                  : t("asg.nClassesNoSupervisor", { n: unsupervised.length })}
              </p>
              <p className="mt-0.5 text-xs text-amber-800">
                {t("asg.cannotTake", {
                  names: unsupervised.map((c) => c.name).join(", "),
                })}
              </p>
            </div>
          )}

          <section className="mb-8">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-500">
              {t("asg.supervisorsHeading")}
            </h2>
            <div className="grid gap-5 lg:grid-cols-2">
              {supervisors.length === 0 && (
                <Card>
                  <EmptyState>{t("asg.noSupervisors")}</EmptyState>
                </Card>
              )}
              {supervisors.map((supervisor) => (
                <Card
                  key={supervisor.id}
                  title={`${supervisor.firstName} ${supervisor.lastName}`}
                  subtitle={t("asg.nOfTotal", {
                    n: supervisor.supervisedClasses.length,
                    total: classes.length,
                  })}
                >
                  <div className="px-5 py-4">
                    <ActionForm
                      action={saveAssignments}
                      submitLabel={t("asg.save")}
                      submitClassName="btn-secondary"
                    >
                      <input type="hidden" name="userId" value={supervisor.id} />
                      <input type="hidden" name="kind" value="SUPERVISOR" />
                      <div className="grid gap-2 sm:grid-cols-2">
                        {classes.map((klass) => (
                          <label
                            key={klass.id}
                            className="flex items-center gap-2 rounded-lg border border-ink-200 px-3 py-2 text-sm text-ink-700 has-checked:border-brand-300 has-checked:bg-brand-50"
                          >
                            <input
                              type="checkbox"
                              name="classIds"
                              value={klass.id}
                              disabled={!canEdit}
                              defaultChecked={supervisor.supervisedClasses.some(
                                (c) => c.classId === klass.id,
                              )}
                              className="h-4 w-4 accent-brand-600"
                            />
                            {klass.name}
                          </label>
                        ))}
                      </div>
                    </ActionForm>
                  </div>
                </Card>
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-500">
              {t("asg.teachersHeading")}
            </h2>
            <div className="grid gap-5 lg:grid-cols-2">
              {teachers.length === 0 && (
                <Card>
                  <EmptyState>{t("asg.noTeachers")}</EmptyState>
                </Card>
              )}
              {teachers.map((teacher) => (
                <Card
                  key={teacher.id}
                  title={`${teacher.firstName} ${teacher.lastName}`}
                  subtitle={t("asg.nOfTotal", {
                    n: teacher.taughtClasses.length,
                    total: classes.length,
                  })}
                >
                  <div className="px-5 py-4">
                    <ActionForm
                      action={saveAssignments}
                      submitLabel={t("asg.save")}
                      submitClassName="btn-secondary"
                    >
                      <input type="hidden" name="userId" value={teacher.id} />
                      <input type="hidden" name="kind" value="TEACHER" />
                      <div className="mb-3">
                        <label className="label" htmlFor={`subject-${teacher.id}`}>
                          {t("asg.subject")}
                        </label>
                        <input
                          id={`subject-${teacher.id}`}
                          name="subject"
                          className="input"
                          disabled={!canEdit}
                          defaultValue={teacher.taughtClasses[0]?.subject ?? ""}
                          placeholder="Mathematics"
                        />
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {classes.map((klass) => (
                          <label
                            key={klass.id}
                            className="flex items-center gap-2 rounded-lg border border-ink-200 px-3 py-2 text-sm text-ink-700 has-checked:border-brand-300 has-checked:bg-brand-50"
                          >
                            <input
                              type="checkbox"
                              name="classIds"
                              value={klass.id}
                              disabled={!canEdit}
                              defaultChecked={teacher.taughtClasses.some(
                                (c) => c.classId === klass.id,
                              )}
                              className="h-4 w-4 accent-brand-600"
                            />
                            {klass.name}
                          </label>
                        ))}
                      </div>
                    </ActionForm>
                  </div>
                </Card>
              ))}
            </div>
          </section>
        </>
      )}
    </>
  );
}
