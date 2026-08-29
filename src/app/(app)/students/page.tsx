import Link from "next/link";
import { requireModule } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getCurrentYear, getVisibleClassIds } from "@/lib/queries";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { getT } from "@/lib/locale";
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
  const t = await getT();
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
      // `mode: "insensitive"` is required on Postgres: unlike SQLite, LIKE is
      // case-sensitive there, so without it searching "ahmed" would not find
      // "Ahmed" — a silent regression, since the query still succeeds.
      ...(query
        ? {
            OR: [
              { firstName: { contains: query, mode: "insensitive" as const } },
              { lastName: { contains: query, mode: "insensitive" as const } },
              { code: { contains: query, mode: "insensitive" as const } },
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
        title={t("students.title")}
        description={
          visible === "ALL"
            ? t("students.allOf", { name: year?.name ?? t("app.tagline") })
            : t("students.assignedToYou")
        }
        actions={
          <a
            href={`/students/export${params.classId ? `?classId=${encodeURIComponent(params.classId)}` : ""}`}
            className="btn-secondary btn-sm"
          >
            {t("action.exportExcel")}
          </a>
        }
      />

      {/* Filters */}
      <form className="mb-5 flex flex-wrap items-end gap-3" action="/students">
        <div>
          <label className="label" htmlFor="classId">{t("common.class")}</label>
          <select
            id="classId"
            name="classId"
            className="select w-52"
            defaultValue={selectedClass ?? ""}
          >
            <option value="">{t("common.allClasses")}</option>
            {classes.map((klass) => (
              <option key={klass.id} value={klass.id}>
                {klass.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="q">{t("action.search")}</label>
          <input
            id="q"
            name="q"
            className="input w-56"
            placeholder={t("stu.nameOrCode")}
            defaultValue={query}
          />
        </div>
        <button type="submit" className="btn-secondary">{t("common.apply")}</button>
        {(selectedClass || query) && (
          <Link href="/students" className="btn-secondary">{t("action.clear")}</Link>
        )}
      </form>

      {canEdit && (
        <div className="mb-6">
          <Disclosure label={t("stu.importCsv")}>
            <ImportPanel
              labels={{
                paste: t("stu.pasteCsv"),
                columnsLead: t("stu.colsLead"),
                and: t("stu.colsAnd"),
                areRequired: t("stu.colsRequired"),
                areOptional: t("stu.colsOptional"),
                checking: t("stu.checking"),
                check: t("stu.checkFile"),
                // Raw templates: the client fills them as the preview changes.
                readyTemplate: t("stu.nReady"),
                skippedTemplate: t("stu.nSkipped"),
                importOneTemplate: t("stu.importOne"),
                importManyTemplate: t("stu.importN"),
                importing: t("stu.importing"),
                line: t("stu.line"),
                name: t("common.name"),
                code: t("common.code"),
                born: t("stu.born"),
                klass: t("common.class"),
                parent: t("common.parent"),
                status: t("common.status"),
                ready: t("stu.ready"),
              }}
            />
          </Disclosure>
        </div>
      )}

      {canEdit && (
        <div className="mb-6">
          <Disclosure label={t("stu.add")}>
            <ActionForm action={createStudent} submitLabel={t("stu.create")} resetOnSuccess>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <label className="label" htmlFor="firstName">{t("common.firstName")}</label>
                  <input id="firstName" name="firstName" className="input" required />
                </div>
                <div>
                  <label className="label" htmlFor="lastName">{t("common.lastName")}</label>
                  <input id="lastName" name="lastName" className="input" required />
                </div>
                <div>
                  <label className="label" htmlFor="code">{t("stu.codeAuto")}</label>
                  <input id="code" name="code" className="input" placeholder="STU-0123" />
                </div>
                <div>
                  <label className="label" htmlFor="dateOfBirth">{t("common.dateOfBirth")}</label>
                  <input id="dateOfBirth" name="dateOfBirth" type="date" className="input" />
                </div>
                <div>
                  <label className="label" htmlFor="newClassId">{t("common.class")}</label>
                  <select id="newClassId" name="classId" className="select">
                    <option value="">{t("common.unassigned")}</option>
                    {classes.map((klass) => (
                      <option key={klass.id} value={klass.id}>{klass.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="parentId">{t("common.parent")}</label>
                  <select id="parentId" name="parentId" className="select">
                    <option value="">{t("common.none")}</option>
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
        title={
          students.length === 1
            ? t("stu.oneStudent", { n: students.length })
            : t("dash.nStudents", { n: students.length })
        }
        subtitle={
          selectedClass
            ? classes.find((c) => c.id === selectedClass)?.name
            : t("common.allClasses")
        }
      >
        {students.length === 0 ? (
          <EmptyState>{t("stu.noMatch")}</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>{t("common.code")}</th>
                  <th>{t("common.name")}</th>
                  <th>{t("common.class")}</th>
                  <th>{t("common.parent")}</th>
                  {canEdit && <th className="text-end">{t("stu.moveToClass")}</th>}
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
                        <span className="badge bg-amber-50 text-amber-700">
                          {t("common.unassigned")}
                        </span>
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
                            aria-label={t("stu.classFor", {
                              name: `${student.firstName} ${student.lastName}`,
                            })}
                            className="select w-40 py-1 text-xs"
                            defaultValue={student.classId ?? ""}
                          >
                            <option value="">{t("common.unassigned")}</option>
                            {classes.map((klass) => (
                              <option key={klass.id} value={klass.id}>
                                {klass.name}
                              </option>
                            ))}
                          </select>
                          <button type="submit" className="btn-secondary btn-sm">
                            {t("stu.move")}
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
