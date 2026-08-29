import Link from "next/link";
import { requireModule } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getCurrentYear } from "@/lib/queries";
import { getI18n } from "@/lib/locale";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { ActionForm, Disclosure } from "@/components/action-form";
import { createClass } from "./actions";

export default async function ClassesPage() {
  const user = await requireModule("classes");
  const { t } = await getI18n();
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
        title={t("common.classes")}
        description={
          year
            ? t("cls.subtitle", { name: year.name })
            : t("cls.noCurrentYear")
        }
        actions={
          <Link href="/assignments" className="btn-secondary btn-sm">
            {t("cls.manageAssignments")}
          </Link>
        }
      />

      {canEdit && year && (
        <div className="mb-6">
          <Disclosure label={t("cls.add")}>
            <ActionForm action={createClass} submitLabel={t("cls.create")} resetOnSuccess>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <div>
                  <label className="label" htmlFor="name">{t("cls.name")}</label>
                  <input id="name" name="name" className="input" placeholder={t("cls.namePlaceholder")} required />
                </div>
                <div>
                  <label className="label" htmlFor="level">{t("common.level")}</label>
                  <input id="level" name="level" className="input" placeholder={t("cls.levelPlaceholder")} required />
                </div>
                <div>
                  <label className="label" htmlFor="room">{t("cls.room")}</label>
                  <input id="room" name="room" className="input" placeholder="B203" />
                </div>
                <div>
                  <label className="label" htmlFor="capacity">{t("cls.capacity")}</label>
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
                  <label className="label" htmlFor="academicYearId">{t("acad.year")}</label>
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
        title={
          classes.length === 1
            ? t("cls.nClass", { n: classes.length })
            : t("cls.nClasses", { n: classes.length })
        }
        subtitle={year?.name}
      >
        {classes.length === 0 ? (
          <EmptyState>
            {year ? t("cls.emptyYear") : t("cls.emptyNoYear")}
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>{t("common.class")}</th>
                  <th>{t("common.level")}</th>
                  <th>{t("cls.room")}</th>
                  <th className="text-end">{t("common.students")}</th>
                  <th>{t("role.SUPERVISOR")}</th>
                  <th>{t("cls.teachers")}</th>
                  <th className="text-end">{t("common.actions")}</th>
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
                    <td className="text-end tabular-nums">
                      {klass._count.students}
                      <span className="text-ink-400"> / {klass.capacity}</span>
                    </td>
                    <td className="text-ink-600">
                      {klass.supervisors.length === 0 ? (
                        <span className="badge bg-amber-50 text-amber-700">
                          {t("common.unassigned")}
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
                          {t("common.unassigned")}
                        </span>
                      ) : (
                        t("cls.nAssigned", { n: klass.teachers.length })
                      )}
                    </td>
                    <td className="text-end">
                      <Link href={`/classes/${klass.id}`} className="btn-secondary btn-sm">
                        {t("pa.open")}
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
