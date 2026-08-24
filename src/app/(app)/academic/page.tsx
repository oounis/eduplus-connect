import { ConfirmSubmit } from "@/components/confirm-submit";
import { requireModule } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/dates";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { ActionForm, Disclosure } from "@/components/action-form";
import {
  createAcademicYear,
  createTerm,
  deleteAcademicYear,
  deleteTerm,
  setCurrentYear,
} from "./actions";

export default async function AcademicPage() {
  const user = await requireModule("academic");
  const canEdit = user.access.academic.edit;

  const years = await prisma.academicYear.findMany({
    orderBy: { startDate: "desc" },
    include: {
      terms: { orderBy: { startDate: "asc" } },
      _count: { select: { classes: true } },
    },
  });

  return (
    <>
      <PageHeader
        title="Academic years"
        description="Define the school year and its terms. Classes, attendance and observations all hang off the current year."
      />

      {canEdit && (
        <div className="mb-6 grid gap-4 lg:grid-cols-2">
          <Disclosure label="Add an academic year">
            <ActionForm
              action={createAcademicYear}
              submitLabel="Create year"
              resetOnSuccess
            >
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="label" htmlFor="name">Name</label>
                  <input
                    id="name"
                    name="name"
                    className="input"
                    placeholder="2027-2028"
                    required
                  />
                </div>
                <div>
                  <label className="label" htmlFor="startDate">Starts</label>
                  <input id="startDate" name="startDate" type="date" className="input" required />
                </div>
                <div>
                  <label className="label" htmlFor="endDate">Ends</label>
                  <input id="endDate" name="endDate" type="date" className="input" required />
                </div>
              </div>
            </ActionForm>
          </Disclosure>

          <Disclosure label="Add a term">
            <ActionForm action={createTerm} submitLabel="Create term" resetOnSuccess>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="label" htmlFor="academicYearId">Academic year</label>
                  <select id="academicYearId" name="academicYearId" className="select" required>
                    {years.map((year) => (
                      <option key={year.id} value={year.id}>
                        {year.name}
                        {year.isCurrent ? " (current)" : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="label" htmlFor="termName">Term name</label>
                  <input id="termName" name="name" className="input" placeholder="Term 1" required />
                </div>
                <div>
                  <label className="label" htmlFor="termStart">Starts</label>
                  <input id="termStart" name="startDate" type="date" className="input" required />
                </div>
                <div>
                  <label className="label" htmlFor="termEnd">Ends</label>
                  <input id="termEnd" name="endDate" type="date" className="input" required />
                </div>
              </div>
            </ActionForm>
          </Disclosure>
        </div>
      )}

      {years.length === 0 ? (
        <Card>
          <EmptyState>No academic year has been created yet.</EmptyState>
        </Card>
      ) : (
        <div className="space-y-5">
          {years.map((year) => (
            <Card
              key={year.id}
              title={year.name}
              subtitle={`${formatDate(year.startDate)} → ${formatDate(year.endDate)} · ${year._count.classes} classes`}
              actions={
                <div className="flex items-center gap-2">
                  {year.isCurrent ? (
                    <span className="badge bg-emerald-50 text-emerald-700">
                      Current year
                    </span>
                  ) : (
                    canEdit && (
                      <>
                        <form action={setCurrentYear}>
                          <input type="hidden" name="id" value={year.id} />
                          <button type="submit" className="btn-secondary btn-sm">
                            Make current
                          </button>
                        </form>
                        {year._count.classes === 0 && (
                          <form action={deleteAcademicYear}>
                            <input type="hidden" name="id" value={year.id} />
                            <ConfirmSubmit
                              className="btn-danger btn-sm"
                              message={`Delete the academic year ${year.name}? This cannot be undone.`}
                            >
                              Delete
                            </ConfirmSubmit>
                          </form>
                        )}
                      </>
                    )
                  )}
                </div>
              }
            >
              {year.terms.length === 0 ? (
                <EmptyState>No terms defined for this year.</EmptyState>
              ) : (
                <div className="overflow-x-auto">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Term</th>
                        <th>Starts</th>
                        <th>Ends</th>
                        <th className="text-end">Weeks</th>
                        {canEdit && <th className="text-end">Actions</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {year.terms.map((term) => {
                        const weeks = Math.round(
                          (term.endDate.getTime() - term.startDate.getTime()) /
                            (7 * 24 * 3600 * 1000),
                        );
                        return (
                          <tr key={term.id}>
                            <td className="font-medium text-ink-900">{term.name}</td>
                            <td className="text-ink-600">{formatDate(term.startDate)}</td>
                            <td className="text-ink-600">{formatDate(term.endDate)}</td>
                            <td className="text-end tabular-nums">{weeks}</td>
                            {canEdit && (
                              <td className="text-end">
                                <form action={deleteTerm} className="flex justify-end">
                                  <input type="hidden" name="id" value={term.id} />
                                  <ConfirmSubmit
                                    className="btn-danger btn-sm"
                                    message={`Remove the term ${term.name}? This cannot be undone.`}
                                  >
                                    Remove
                                  </ConfirmSubmit>
                                </form>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
