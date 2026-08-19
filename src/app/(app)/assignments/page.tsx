import { requireModule } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getCurrentYear } from "@/lib/queries";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { ActionForm } from "@/components/action-form";
import { saveAssignments } from "./actions";

export default async function AssignmentsPage() {
  const user = await requireModule("assignments");
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
        title="Assignments"
        description={`Assign classes of ${year?.name ?? "the current year"} to supervisors (who take attendance) and teachers (who log observations).`}
      />

      {classes.length === 0 ? (
        <Card>
          <EmptyState>
            Create an academic year and some classes before assigning staff.
          </EmptyState>
        </Card>
      ) : (
        <>
          {unsupervised.length > 0 && (
            <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
              <p className="text-sm font-medium text-amber-900">
                {unsupervised.length}{" "}
                {unsupervised.length === 1 ? "class has" : "classes have"} no
                supervisor
              </p>
              <p className="mt-0.5 text-xs text-amber-800">
                Attendance cannot be taken for {unsupervised.map((c) => c.name).join(", ")}.
              </p>
            </div>
          )}

          <section className="mb-8">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-500">
              Supervisors — daily attendance
            </h2>
            <div className="grid gap-5 lg:grid-cols-2">
              {supervisors.length === 0 && (
                <Card>
                  <EmptyState>No supervisor accounts exist yet.</EmptyState>
                </Card>
              )}
              {supervisors.map((supervisor) => (
                <Card
                  key={supervisor.id}
                  title={`${supervisor.firstName} ${supervisor.lastName}`}
                  subtitle={`${supervisor.supervisedClasses.length} of ${classes.length} classes`}
                >
                  <div className="px-5 py-4">
                    <ActionForm
                      action={saveAssignments}
                      submitLabel="Save assignment"
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
              Teachers — daily observations
            </h2>
            <div className="grid gap-5 lg:grid-cols-2">
              {teachers.length === 0 && (
                <Card>
                  <EmptyState>No teacher accounts exist yet.</EmptyState>
                </Card>
              )}
              {teachers.map((teacher) => (
                <Card
                  key={teacher.id}
                  title={`${teacher.firstName} ${teacher.lastName}`}
                  subtitle={`${teacher.taughtClasses.length} of ${classes.length} classes`}
                >
                  <div className="px-5 py-4">
                    <ActionForm
                      action={saveAssignments}
                      submitLabel="Save assignment"
                      submitClassName="btn-secondary"
                    >
                      <input type="hidden" name="userId" value={teacher.id} />
                      <input type="hidden" name="kind" value="TEACHER" />
                      <div className="mb-3">
                        <label className="label" htmlFor={`subject-${teacher.id}`}>
                          Subject
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
