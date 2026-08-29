import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { getI18n } from "@/lib/locale";
import { formatDate, toDayKey } from "@/lib/dates";
import { getPeriods } from "@/lib/periods";
import { findLivePeriod, findNextPeriod, schoolClock } from "@/lib/school-time";
import { QUICK_COOKIE, verifyQuickSession, QUICK_PIN_LENGTH } from "@/lib/quick-session";
import { KogiaTile } from "@/components/kogia";
import QuickSignInForm from "./sign-in-form";

/**
 * Quick attendance — the way in from a shared classroom device.
 *
 * Reachable without signing in, as asked for: a teacher picks their name and
 * types a short PIN instead of an email and password.
 *
 * The PIN is the one thing added to the request. Without it this page lists
 * every teacher AND every child in the school to anyone who finds the URL, and
 * lets any visitor file attendance under a named teacher — which also makes the
 * audit trail meaningless. So the roster is behind the PIN; only the list of
 * teacher names is public, and that is the minimum the "choose your name" step
 * needs.
 */
export default async function QuickPage({
  searchParams,
}: {
  searchParams: Promise<{ teacher?: string }>;
}) {
  const { locale, t } = await getI18n();
  const params = await searchParams;

  // Already signed in on this device — go straight to the register.
  const jar = await cookies();
  if (await verifyQuickSession(jar.get(QUICK_COOKIE)?.value)) {
    redirect("/quick/register");
  }

  const clock = schoolClock();
  const periods = await getPeriods();
  const livePeriod = findLivePeriod(periods, clock.minutes);
  const nextPeriod = findNextPeriod(periods, clock.minutes);

  // Only teachers an administrator has actually given a PIN. A teacher without
  // one does not appear, so quick access is opt-in per person.
  const teachers = await prisma.user.findMany({
    where: { role: "TEACHER", isActive: true, quickPin: { not: null } },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: { id: true, firstName: true, lastName: true },
  });

  // An id in the URL only counts if it is one of the teachers above, so a
  // guessed or stale id falls back to the list rather than naming somebody.
  const chosen = teachers.find((teacher) => teacher.id === params.teacher) ?? null;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <KogiaTile size={32} />
          <span className="text-lg font-semibold tracking-tight">
            {t("app.name")}
          </span>
        </div>

        {/* What is running right now — the reason to be on this page */}
        <div
          className={`mb-5 rounded-xl border px-5 py-4 text-center ${
            livePeriod
              ? "border-emerald-200 bg-emerald-50"
              : "border-ink-200 bg-white"
          }`}
        >
          <p className="text-xs font-medium uppercase tracking-wide text-ink-500">
            {formatDate(toDayKey(clock.dateISO), locale)} · {clock.time}
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
              {t("pa.nextPeriod", {
                name: nextPeriod.name,
                time: nextPeriod.startTime,
              })}
            </p>
          )}
        </div>

        {/* Two steps, and the chosen name lives in the URL rather than in
            client state — a mistyped PIN must not send a teacher back to
            hunting for their name with a class waiting. */}
        <div className="card px-6 py-6">
          {chosen ? (
            <>
              <Link
                href="/quick"
                className="text-xs text-ink-500 hover:text-ink-800"
              >
                ← {t("quick.notYou")}
              </Link>
              <h1 className="mt-2 text-lg font-semibold tracking-tight text-ink-900">
                {chosen.firstName} {chosen.lastName}
              </h1>
              <p className="mt-1 text-sm text-ink-500">{t("quick.enterPin")}</p>

              <QuickSignInForm
                teacherId={chosen.id}
                labels={{
                  pin: t("quick.pin"),
                  pinHint: t("quick.pinHint", { n: QUICK_PIN_LENGTH }),
                  submit: t("quick.open"),
                }}
                pinLength={QUICK_PIN_LENGTH}
              />
            </>
          ) : (
            <>
              <h1 className="text-lg font-semibold tracking-tight text-ink-900">
                {t("quick.title")}
              </h1>
              <p className="mt-1 text-sm text-ink-500">{t("quick.subtitle")}</p>

              {teachers.length === 0 ? (
                <p className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  {t("quick.noTeachers")}
                </p>
              ) : (
                <ul className="mt-5 space-y-2">
                  {teachers.map((teacher) => (
                    <li key={teacher.id}>
                      <Link
                        href={`/quick?teacher=${teacher.id}`}
                        className="btn-secondary flex w-full items-center justify-between py-3 text-start"
                      >
                        <span className="font-medium">
                          {teacher.firstName} {teacher.lastName}
                        </span>
                        <span aria-hidden="true" className="text-ink-400">›</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>

        <p className="mt-5 text-center text-xs text-ink-500">
          {t("quick.fullAccess")}{" "}
          <Link href="/login" className="font-medium text-brand-600 hover:underline">
            {t("login.title")}
          </Link>
        </p>
      </div>
    </main>
  );
}
