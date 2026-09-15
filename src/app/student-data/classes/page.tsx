import Link from "next/link";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getI18n } from "@/lib/locale";
import { formatMonthName } from "@/lib/dates";
import { DATA_COOKIE, verifyDataSession } from "@/lib/data-session";
import {
  defaultMonthRange,
  findSupervisor,
  formatMonth,
  monthBounds,
  monthsBetween,
  resolveDataScope,
} from "@/lib/student-data";
import { KogiaTile } from "@/components/kogia";
import { dataSignOut } from "../actions";
import Workspace from "./workspace";

/**
 * The supervisor's workspace: their classes, then one class's students with
 * their contact details, the two list exports and the message file.
 *
 * The supervisor's identity comes from the signed cookie only. There is no
 * supervisor parameter here — a crafted URL cannot open somebody else's
 * classes, and a class id that is not theirs resolves to "no class chosen"
 * rather than to that class.
 */
export default async function StudentDataClassesPage({
  searchParams,
}: {
  searchParams: Promise<{ classId?: string }>;
}) {
  const { locale, t } = await getI18n();
  const params = await searchParams;

  const jar = await cookies();
  const session = await verifyDataSession(jar.get(DATA_COOKIE)?.value);
  if (!session) redirect("/student-data");

  const supervisor = await findSupervisor(session.userId);
  if (!supervisor) redirect("/student-data");

  const scope = await resolveDataScope(supervisor, params.classId);
  const months = await defaultMonthRange();

  // Texts an administrator wrote for supervisors to reuse. Retired ones are
  // kept in the database for the audit trail but must not be offered here.
  const templates = await prisma.messageTemplate.findMany({
    where: { isActive: true },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, body: true, mode: true },
  });
  // Every month of the academic year, labelled in the interface language.
  const monthOptions = monthsBetween(months.earliest, months.latest).map(
    (month) => ({
      value: formatMonth(month),
      label: formatMonthName(monthBounds(month).from, locale),
    }),
  );

  const selectedClass = scope.classes.find(
    (klass) => klass.id === scope.selectedClassId,
  );

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-5 py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <KogiaTile size={28} />
          <div className="leading-tight">
            <p className="text-sm font-semibold">
              {supervisor.firstName} {supervisor.lastName}
            </p>
            <p className="text-xs text-ink-500">
              {t("sd.title")}
              {scope.yearName ? ` · ${scope.yearName}` : ""}
            </p>
          </div>
        </div>
        <form action={dataSignOut}>
          <button type="submit" className="btn-secondary btn-sm">
            {t("sd.leave")}
          </button>
        </form>
      </header>

      {scope.classes.length === 0 ? (
        <p className="empty">{t("sd.noClasses")}</p>
      ) : (
        <>
          {/* Step two of the request: the classes assigned to the chosen
              supervisor. Kept visible after one is opened, so moving between
              them is one tap rather than a trip back. */}
          <section className="card mb-6">
            <div className="card-header">
              <div>
                <h2 className="card-title">{t("sd.yourClasses")}</h2>
                <p className="card-subtitle">
                  {t("sd.classCount", { n: scope.classes.length })}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 px-5 py-4">
              {scope.classes.map((klass) => {
                const active = klass.id === scope.selectedClassId;
                return (
                  <Link
                    key={klass.id}
                    href={`/student-data/classes?classId=${klass.id}`}
                    className={
                      active
                        ? "btn-primary btn-sm"
                        : "btn-secondary btn-sm"
                    }
                  >
                    {klass.name}
                  </Link>
                );
              })}
            </div>
          </section>

          {!selectedClass ? (
            <p className="empty">{t("sd.chooseClass")}</p>
          ) : scope.students.length === 0 ? (
            <p className="empty">{t("sd.noStudents")}</p>
          ) : (
            /*
             * Keyed by the class, so switching class gives a fresh component.
             *
             * Without it React keeps this instance across a soft navigation —
             * same type, same position — and its state comes along: the ticked
             * students, the "show one student" filter and the typed message.
             * Ticking five students in one class and then opening another left
             * the exports posting the first class's student ids against the
             * second class's id, which resolves to nobody and hands back an
             * empty workbook while the page still says "5 of 30 selected".
             */
            <Workspace
              key={selectedClass.id}
              classId={selectedClass.id}
              students={scope.students}
              months={{
                options: monthOptions,
                from: formatMonth(months.from),
                to: formatMonth(months.to),
              }}
              labels={{
                roster: `${t("sd.roster")} · ${selectedClass.name}`,
                rosterHint: t("sd.rosterHint"),
                showStudent: t("sd.showStudent"),
                allStudents: t("sd.allStudents"),
                save: t("sd.save"),
                saving: t("sd.saving"),
                selectAll: t("sd.selectAll"),
                selectNone: t("sd.selectNone"),
                selectedCount: t("sd.selectedCount"),
                selectionHint: t("sd.selectionHint"),
                colIndex: t("sd.col.index"),
                colCode: t("sd.col.code"),
                colStudent: t("sd.col.student"),
                colPhone: t("sd.col.phone"),
                colPhone2: t("sd.col.phone2"),
                colPhone3: t("sd.col.phone3"),
                colEmail: t("sd.col.email"),

                exports: t("sd.exports"),
                exportStudents: t("sd.exportStudents"),
                exportStudentsHint: t("sd.exportStudentsHint"),
                exportAttendance: t("sd.exportAttendance"),
                exportAttendanceHint: t("sd.exportAttendanceHint"),
                scope: t("sd.scope"),
                scopeClass: t("sd.scopeClass"),
                scopeAll: t("sd.scopeAll"),
                fromMonth: t("sd.fromMonth"),
                toMonth: t("sd.toMonth"),

                messages: t("sd.messages"),
                messagesHint: t("sd.messagesHint"),
                msgType: t("sd.msgType"),
                msgNamed: t("sd.msgNamed"),
                msgGeneral: t("sd.msgGeneral"),
                // Raw template: the client fills {name} as the supervisor
                // types, and a translator function cannot cross into a client
                // component.
                msgNamedTemplate: t("sd.msgNamedTemplate"),
                msgText: t("sd.msgText"),
                msgPlaceholder: t("sd.msgPlaceholder"),
                msgPreview: t("sd.msgPreview"),
                msgNumbers: t("sd.msgNumbers"),
                msgNumbersHint: t("sd.msgNumbersHint"),
                msgBuild: t("sd.msgBuild"),
                msgEmpty: t("sd.msgEmpty"),
                exampleName: t("sd.exampleName"),
                msgTemplate: t("sd.msgTemplate"),
                msgTemplateNone: t("sd.msgTemplateNone"),
                msgTemplateHint: t("sd.msgTemplateHint"),
              }}
              templates={templates}
            />
          )}
        </>
      )}
    </main>
  );
}
