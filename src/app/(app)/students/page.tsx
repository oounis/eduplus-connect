import Link from "next/link";
import { requireModule } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getCurrentYear, getVisibleClassIds } from "@/lib/queries";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { ActionForm, Disclosure } from "@/components/action-form";
import ImportPanel from "./import-panel";
import { createStudent, moveStudentToClass } from "./actions";

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ classId?: string; q?: string }>;
}) {
  const user = await requireModule("students");
  const params = await searchParams;
  const canEdit = user.access.students.edit;

  const year = await getCurrentYear();
  const visible = await getVisibleClassIds(user);

  const classes = year
    ? await prisma.class.findMany({
        where: {
          academicYearId: year.id,
          ...(visible === "ALL" ? {} : { id: { in: visible } }),
        },
        orderBy: { name: "asc" },
      })
    : [];
  const classIds = classes.map((c) => c.id);

  const selectedClass = params.classId && classIds.includes(params.classId)
    ? params.classId
    : undefined;
  const query = params.q?.trim() ?? "";

  const students = await prisma.student.findMany({
    where: {
      ...(selectedClass
        ? { classId: selectedClass }
        : visible === "ALL"
          ? {}
          : { classId: { in: classIds } }),
      ...(query
        ? {
            OR: [
              { firstName: { contains: query } },
              { lastName: { contains: query } },
              { code: { contains: query } },
            ],
          }
        : {}),
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    include: { class: true, parent: true },
    take: 300,
  });

  const parents = canEdit
    ? await prisma.user.findMany({
        where: { role: "PARENT" },
        orderBy: { lastName: "asc" },
      })
    : [];

  return (
    <>
      <PageHeader
        title="Students"
        description={
          visible === "ALL"
            ? `All students of ${year?.name ?? "the school"}.`
            : "Students in the classes assigned to you."
        }
      />

      {/* Filters */}
      <form className="mb-5 flex flex-wrap items-end gap-3" action="/students">
        <div>
          <label className="label" htmlFor="classId">Class</label>
          <select
            id="classId"
            name="classId"
            className="select w-52"
            defaultValue={selectedClass ?? ""}
          >
            <option value="">All classes</option>
            {classes.map((klass) => (
              <option key={klass.id} value={klass.id}>
                {klass.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="q">Search</label>
          <input
            id="q"
            name="q"
            className="input w-56"
            placeholder="Name or code"
            defaultValue={query}
          />
        </div>
        <button type="submit" className="btn-secondary">Apply</button>
        {(selectedClass || query) && (
          <Link href="/students" className="btn-secondary">Clear</Link>
        )}
      </form>

      {canEdit && (
        <div className="mb-6">
          <Disclosure label="Import students from a CSV file">
            <ImportPanel />
          </Disclosure>
        </div>
      )}

      {canEdit && (
        <div className="mb-6">
          <Disclosure label="Add a student">
            <ActionForm action={createStudent} submitLabel="Create student" resetOnSuccess>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <label className="label" htmlFor="firstName">First name</label>
                  <input id="firstName" name="firstName" className="input" required />
                </div>
                <div>
                  <label className="label" htmlFor="lastName">Last name</label>
                  <input id="lastName" name="lastName" className="input" required />
                </div>
                <div>
                  <label className="label" htmlFor="code">Code (auto if blank)</label>
                  <input id="code" name="code" className="input" placeholder="STU-0123" />
                </div>
                <div>
                  <label className="label" htmlFor="dateOfBirth">Date of birth</label>
                  <input id="dateOfBirth" name="dateOfBirth" type="date" className="input" />
                </div>
                <div>
                  <label className="label" htmlFor="newClassId">Class</label>
                  <select id="newClassId" name="classId" className="select">
                    <option value="">Unassigned</option>
                    {classes.map((klass) => (
                      <option key={klass.id} value={klass.id}>{klass.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="parentId">Parent</label>
                  <select id="parentId" name="parentId" className="select">
                    <option value="">None</option>
                    {parents.map((parent) => (
                      <option key={parent.id} value={parent.id}>
                        {parent.firstName} {parent.lastName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </ActionForm>
          </Disclosure>
        </div>
      )}

      <Card
        title={`${students.length} ${students.length === 1 ? "student" : "students"}`}
        subtitle={
          selectedClass
            ? classes.find((c) => c.id === selectedClass)?.name
            : "All classes"
        }
      >
        {students.length === 0 ? (
          <EmptyState>No students match this filter.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Class</th>
                  <th>Parent</th>
                  {canEdit && <th className="text-right">Move to class</th>}
                </tr>
              </thead>
              <tbody>
                {students.map((student) => (
                  <tr key={student.id}>
                    <td className="font-mono text-xs text-ink-500">{student.code}</td>
                    <td className="font-medium text-ink-900">
                      <Link
                        href={`/students/${student.id}`}
                        className="hover:text-brand-600"
                      >
                        {student.lastName}, {student.firstName}
                      </Link>
                    </td>
                    <td className="text-ink-600">
                      {student.class ? (
                        <Link
                          href={`/classes/${student.class.id}`}
                          className="hover:text-brand-600"
                        >
                          {student.class.name}
                        </Link>
                      ) : (
                        <span className="badge bg-amber-50 text-amber-700">Unassigned</span>
                      )}
                    </td>
                    <td className="text-ink-600">
                      {student.parent
                        ? `${student.parent.firstName} ${student.parent.lastName}`
                        : "—"}
                    </td>
                    {canEdit && (
                      <td>
                        <form action={moveStudentToClass} className="flex justify-end gap-2">
                          <input type="hidden" name="id" value={student.id} />
                          <select
                            name="classId"
                            aria-label={`Class for ${student.firstName} ${student.lastName}`}
                            className="select w-40 py-1 text-xs"
                            defaultValue={student.classId ?? ""}
                          >
                            <option value="">Unassigned</option>
                            {classes.map((klass) => (
                              <option key={klass.id} value={klass.id}>
                                {klass.name}
                              </option>
                            ))}
                          </select>
                          <button type="submit" className="btn-secondary btn-sm">
                            Move
                          </button>
                        </form>
                      </td>
                    )}
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
