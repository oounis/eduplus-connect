import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getI18n } from "@/lib/locale";
import { DATA_COOKIE, verifyDataSession } from "@/lib/data-session";
import { STAFF_PIN_LENGTH } from "@/lib/staff-pin";
import { findSupervisor, listPinSupervisors } from "@/lib/student-data";
import { KogiaTile } from "@/components/kogia";
import DataSignInForm from "./sign-in-form";

/**
 * Student data — the way in for a supervisor with no email login.
 *
 * Two steps, as asked: choose your name, then a PIN. The PIN is the one thing
 * added to the request. Without it this page hands every child's name, their
 * guardians' phone numbers and their email addresses to anyone who finds the
 * URL, and lets any visitor overwrite them under a named supervisor's identity.
 * So only the list of supervisor names is public — the minimum the "choose your
 * name" step needs — and everything else is behind the PIN.
 */
export default async function StudentDataPage({
  searchParams,
}: {
  searchParams: Promise<{ supervisor?: string }>;
}) {
  const { t } = await getI18n();
  const params = await searchParams;

  // Already signed in on this device — go straight to the classes.
  //
  // The token has to still resolve to a supervisor, not merely verify. The
  // workspace re-reads the person on every request and sends an unknown one
  // back here; if this page only checked the signature it would send them
  // straight there again, and an administrator who deactivated an account or
  // cleared its PIN mid-session would have handed that device an infinite
  // redirect instead of a sign-in page. Falling through to the list lets them
  // sign in again, which overwrites the stale cookie.
  const jar = await cookies();
  const session = await verifyDataSession(jar.get(DATA_COOKIE)?.value);
  if (session && (await findSupervisor(session.userId))) {
    redirect("/student-data/classes");
  }

  const supervisors = await listPinSupervisors();

  // An id in the URL only counts if it is one of the supervisors above, so a
  // guessed or stale id falls back to the list rather than naming somebody.
  const chosen = supervisors.find((s) => s.id === params.supervisor) ?? null;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <KogiaTile size={32} />
          <span className="text-lg font-semibold tracking-tight">
            {t("app.name")}
          </span>
        </div>

        {/* The chosen name lives in the URL rather than in client state — a
            mistyped PIN must not send a supervisor back to hunting for their
            own name in the list. */}
        <div className="card px-6 py-6">
          {chosen ? (
            <>
              <Link
                href="/student-data"
                className="text-xs text-ink-500 hover:text-ink-800"
              >
                {"←"} {t("sd.notYou")}
              </Link>
              <h1 className="mt-2 text-lg font-semibold tracking-tight text-ink-900">
                {chosen.firstName} {chosen.lastName}
              </h1>
              <p className="mt-1 text-sm text-ink-500">{t("sd.enterPin")}</p>

              <DataSignInForm
                supervisorId={chosen.id}
                labels={{
                  pin: t("sd.pin"),
                  pinHint: t("sd.pinHint", { n: STAFF_PIN_LENGTH }),
                  submit: t("sd.open"),
                }}
                pinLength={STAFF_PIN_LENGTH}
              />
            </>
          ) : (
            <>
              <h1 className="text-lg font-semibold tracking-tight text-ink-900">
                {t("sd.title")}
              </h1>
              <p className="mt-1 text-sm text-ink-500">{t("sd.subtitle")}</p>

              {supervisors.length === 0 ? (
                <p className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  {t("sd.noSupervisors")}
                </p>
              ) : (
                <ul className="mt-5 space-y-2">
                  {supervisors.map((supervisor) => (
                    <li key={supervisor.id}>
                      <Link
                        href={`/student-data?supervisor=${supervisor.id}`}
                        className="btn-secondary flex w-full items-center justify-between py-3 text-start"
                      >
                        <span className="font-medium">
                          {supervisor.firstName} {supervisor.lastName}
                        </span>
                        <span aria-hidden="true" className="text-ink-400">
                          {"›"}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>

        <p className="mt-5 text-center text-xs text-ink-500">
          {t("sd.fullAccess")}{" "}
          <Link href="/login" className="font-medium text-brand-600 hover:underline">
            {t("login.title")}
          </Link>
        </p>
      </div>
    </main>
  );
}
