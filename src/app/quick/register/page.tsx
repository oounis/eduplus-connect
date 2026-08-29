import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { getI18n } from "@/lib/locale";
import { formatDate, toDayKey } from "@/lib/dates";
import { getPeriodContext } from "@/lib/periods";
import { findNextPeriod } from "@/lib/school-time";
import { ATTENDANCE_STATUSES, MODULES, type AttendanceStatus } from "@/lib/constants";
import type { AccessMap } from "@/lib/auth";
import { QUICK_COOKIE, verifyQuickSession } from "@/lib/quick-session";
import { KogiaTile } from "@/components/kogia";
import { quickSignOut } from "../actions";
import QuickRegister from "./register-form";

/** Denied everywhere except the period register — see actions.ts. */
function quickAccess(): AccessMap {
  const access = Object.fromEntries(
    MODULES.map((key) => [key, { view: false, edit: false }]),
  ) as AccessMap;
  access.periodAttendance = { view: true, edit: true };
  return access;
}

export default async function QuickRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ classId?: string }>;
}) {
  const { locale, t } = await getI18n();
  const params = await searchParams;

  // The teacher's identity comes from the signed cookie only. There is no
  // teacher parameter here — a crafted URL cannot open somebody else's class.
  const jar = await cookies();
  const session = await verifyQuickSession(jar.get(QUICK_COOKIE)?.value);
  if (!session) redirect("/quick");

  const teacher = await prisma.user.findFirst({
    where: { id: session.userId, role: "TEACHER", isActive: true },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!teacher) redirect("/quick");

  const context = await getPeriodContext(
    { userId: teacher.id, role: "TEACHER", access: quickAccess() },
    { classId: params.classId, teacherId: teacher.id },
  );

  const { clock, periods, livePeriod, selectedPeriod, classes, selectedClassId, students, access } =
    context;
  const nextPeriod = findNextPeriod(periods, clock.minutes);
  const readOnly = !access.canWrite;

  const statusLabels = Object.fromEntries(
    ATTENDANCE_STATUSES.map((s) => [s, t(`attendance.${s}`)]),
  ) as Record<AttendanceStatus, string>;

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-5 py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <KogiaTile size={28} />
          <div className="leading-tight">
            <p className="text-sm font-semibold">{teacher.firstName} {teacher.lastName}</p>
            <p className="text-xs text-ink-500">
              {formatDate(toDayKey(context.dateISO), locale)} · {clock.time}
            </p>
          </div>
        </div>
        <form action={quickSignOut}>
          <button type="submit" className="btn-secondary btn-sm">
            {t("quick.leave")}
          </button>
        </form>
      </header>

      {/* The period running now */}
      <div
        className={`mb-5 rounded-xl border px-5 py-4 ${
          livePeriod ? "border-emerald-200 bg-emerald-50" : "border-ink-200 bg-white"
        }`}
      >
        <p className="text-xs font-medium uppercase tracking-wide text-ink-500">
          {t("pa.currentPeriod")}
        </p>
        {livePeriod ? (
          <p className="mt-1 text-lg font-semibold text-emerald-800">
            {livePeriod.name}{" "}
            <span className="text-sm font-normal tabular-nums">
              {livePeriod.startTime} – {livePeriod.endTime}
            </span>
          </p>
        ) : (
          <p className="mt-1 text-lg font-semibold text-ink-700">
            {periods.length === 0
              ? t("pa.noPeriods")
              : nextPeriod
                ? t("pa.between")
                : t("pa.dayOver")}
          </p>
        )}
        {nextPeriod && (
          <p className="mt-0.5 text-xs text-ink-500">
            {t("pa.nextPeriod", { name: nextPeriod.name, time: nextPeriod.startTime })}
          </p>
        )}
      </div>

      {/* Class picker — only the classes assigned to this teacher */}
      {classes.length > 1 && (
        <form className="mb-5 flex flex-wrap items-end gap-3" action="/quick/register">
          <div className="flex-1">
            <label className="label" htmlFor="classId">
              {t("pa.class")}
            </label>
            <select
              id="classId"
              name="classId"
              className="select"
              defaultValue={selectedClassId ?? ""}
            >
              {classes.map((klass) => (
                <option key={klass.id} value={klass.id}>
                  {klass.name}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn-secondary">
            {t("pa.open")}
          </button>
        </form>
      )}

      {classes.length === 0 ? (
        <p className="empty">{t("pa.noClasses")}</p>
      ) : students.length === 0 ? (
        <p className="empty">{t("pa.noStudents")}</p>
      ) : (
        <>
          {readOnly && (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-900">
              {t(`pa.lock.${access.reason}`)}
            </div>
          )}
          <QuickRegister
            classId={selectedClassId!}
            periodId={selectedPeriod?.id ?? ""}
            students={students}
            readOnly={readOnly}
            labels={{
              save: t("pa.save"),
              allPresent: t("pa.allPresent"),
              quickFill: t("pa.quickFill"),
              clear: t("action.clear"),
              markedTemplate: t("pa.marked"),
              statusLabels,
            }}
          />
        </>
      )}
    </main>
  );
}
