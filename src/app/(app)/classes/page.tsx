import Link from "next/link";
import { requireModule } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getCurrentYear } from "@/lib/queries";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { ActionForm, Disclosure } from "@/components/action-form";
import { createClass } from "./actions";

export default async function ClassesPage() {
  const user = await requireModule("classes");
  const canEdit = user.access.classes.edit;

  const year = await getCurrentYear();
  const years = await prisma.academicYear.findMany({
    orderBy: { startDate: "desc" },
  });

  const classes = year
    ? await prisma.class.findMany({
        where: { academicYearId: year.id },
        orderBy: { name: "asc" },
        include: {
          _count: { select: { students: true } },
          supervisors: { include: { user: true } },
          teachers: { include: { user: true } },
        },
      })
    : [];

  return (
    <>
      <PageHeader
        title="Classes"
        description={
          year
            ? `Classes of ${year.name}, the current academic year.`
            : "No academic year is marked as current yet."
        }
        actions={
          <Link href="/assignments" className="btn-secondary btn-sm">
            Manage assignments
          </Link>
        }
      />

      {canEdit && year && (
        <div className="mb-6">
          <Disclosure label="Add a class">
            <ActionForm action={createClass} submitLabel="Create class" resetOnSuccess>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <div>
                  <label className="label" htmlFor="name">Class name</label>
                  <input id="name" name="name" className="input" placeholder="Grade 5 - C" required />
                </div>
                <div>
                  <label className="label" htmlFor="level">Level</label>
                  <input id="level" name="level" className="input" placeholder="Grade 5" required />
                </div>
                <div>
                  <label className="label" htmlFor="room">Room</label>
                  <input id="room" name="room" className="input" placeholder="B203" />
                </div>
                <div>
                  <label className="label" htmlFor="capacity">Capacity</label>
                  <input
                    id="capacity"
                    name="capacity"
                    type="number"
                    min={1}
                    max={200}
                    defaultValue={30}
                    className="input"
                    required
                  />
                </div>
                <div>
                  <label className="label" htmlFor="academicYearId">Academic year</label>
                  <select
                    id="academicYearId"
                    name="academicYearId"
                    className="select"
                    defaultValue={year.id}
                  >
                    {years.map((y) => (
                      <option key={y.id} value={y.id}>
                        {y.name}
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
        title={`${classes.length} ${classes.length === 1 ? "class" : "classes"}`}
        subtitle={year?.name}
      >
        {classes.length === 0 ? (
          <EmptyState>
            {year
              ? "No classes yet for this academic year."
              : "Create an academic year first, then add classes to it."}
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Class</th>
                  <th>Level</th>
                  <th>Room</th>
                  <th className="text-right">Students</th>
                  <th>Supervisor</th>
                  <th>Teachers</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {classes.map((klass) => (
                  <tr key={klass.id}>
                    <td className="font-medium text-ink-900">
                      <Link href={`/classes/${klass.id}`} className="hover:text-brand-600">
                        {klass.name}
                      </Link>
                    </td>
                    <td className="text-ink-600">{klass.level}</td>
                    <td className="text-ink-600">{klass.room ?? "—"}</td>
                    <td className="text-right tabular-nums">
                      {klass._count.students}
                      <span className="text-ink-400"> / {klass.capacity}</span>
                    </td>
                    <td className="text-ink-600">
                      {klass.supervisors.length === 0 ? (
                        <span className="badge bg-amber-50 text-amber-700">
                          Unassigned
                        </span>
                      ) : (
                        klass.supervisors
                          .map((s) => `${s.user.firstName} ${s.user.lastName}`)
                          .join(", ")
                      )}
                    </td>
                    <td className="text-ink-600">
                      {klass.teachers.length === 0 ? (
                        <span className="badge bg-amber-50 text-amber-700">
                          Unassigned
                        </span>
                      ) : (
                        `${klass.teachers.length} assigned`
                      )}
                    </td>
                    <td className="text-right">
                      <Link href={`/classes/${klass.id}`} className="btn-secondary btn-sm">
                        Open
                      </Link>
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
