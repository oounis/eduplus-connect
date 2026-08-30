import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getI18n } from "@/lib/locale";
import { LanguageSwitch } from "@/components/language-switch";
import LoginForm from "./login-form";

const DEMO_ACCOUNTS = [
  { roleKey: "ADMIN", email: "admin@eduplus.school" },
  { roleKey: "DEPUTY", email: "deputy@eduplus.school" },
  { roleKey: "STAFF", email: "staff@eduplus.school" },
  { roleKey: "SUPERVISOR", email: "supervisor@eduplus.school" },
  { roleKey: "TEACHER", email: "teacher@eduplus.school" },
  { roleKey: "PARENT", email: "parent@eduplus.school" },
  { roleKey: "STUDENT", email: "student@eduplus.school" },
];

export default async function LoginPage() {
  // Only a session that still resolves to an active user skips the form. A
  // stale cookie (reseeded database, deleted account) must land HERE, not
  // bounce to /dashboard and back forever.
  if (await getCurrentUser()) redirect("/dashboard");

  const { locale, t } = await getI18n();

  return (
    <main className="flex min-h-screen flex-col lg:flex-row">
      {/* Brand panel */}
      <section className="relative flex flex-col justify-between bg-brand-700 px-8 py-10 text-white lg:w-[42%] lg:px-12 lg:py-14">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-12 items-center justify-center rounded-lg bg-white/15 px-1.5">
              {/* The Kogia whale, white on the EduPlus blue (brand/marque) */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/kogia/mark-white.svg" alt="" width={36} height={26} />
            </div>
            <span className="text-lg font-semibold tracking-tight">
              {t("app.name")}
            </span>
          </div>
          <h1 className="mt-10 max-w-md text-3xl font-semibold leading-tight tracking-tight lg:mt-16 lg:text-4xl">
            {t("login.headline")}
          </h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-brand-100">
            {t("login.blurb")}
          </p>
        </div>

        <dl className="mt-12 grid grid-cols-3 gap-4 border-t border-white/15 pt-6 text-sm">
          <div>
            <dt className="text-brand-200">{t("login.statRoles")}</dt>
            <dd className="mt-0.5 text-xl font-semibold">7</dd>
          </div>
          <div>
            <dt className="text-brand-200">{t("login.statModules")}</dt>
            <dd className="mt-0.5 text-xl font-semibold">10</dd>
          </div>
          <div>
            <dt className="text-brand-200">{t("login.statAccess")}</dt>
            <dd className="mt-0.5 text-xl font-semibold">{t("login.statPerRole")}</dd>
          </div>
        </dl>
      </section>

      {/* Form panel */}
      <section className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <h2 className="text-xl font-semibold tracking-tight text-ink-900">
            {t("login.title")}
          </h2>
          <p className="mt-1 text-sm text-ink-500">
            {t("login.useSchoolAccount")}
          </p>

          <LoginForm
            emailLabel={t("login.emailAddress")}
            passwordLabel={t("login.password")}
            submitLabel={t("login.submit")}
            submittingLabel={t("login.submitting")}
          />

          {/* The classroom way in: a teacher on a shared device picks their
              name and types a PIN, and lands on the register for the period
              running now — no email and password between them and the class. */}
          <div className="mt-6 border-t border-ink-200 pt-6">
            <Link
              href="/quick"
              className="btn-secondary flex w-full items-center justify-center gap-2 py-2.5"
            >
              {t("quick.fromLogin")}
            </Link>
            <p className="mt-2 text-center text-xs text-ink-500">
              {t("quick.fromLoginHint")}
            </p>
          </div>

          {/* Development only. On a real school's sign-in page this listed
              seven demo accounts and published their shared password, which
              is both an invitation and a lie — those accounts do not exist
              in production. */}
          {process.env.NODE_ENV !== "production" && (
            <details className="mt-8 rounded-xl border border-ink-200 bg-white p-4">
              <summary className="cursor-pointer text-xs font-semibold text-ink-700">
                {t("login.demoAccounts")}
              </summary>
              <ul className="mt-3 space-y-2">
                {DEMO_ACCOUNTS.map((account) => (
                  <li key={account.email} className="text-xs">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-medium text-ink-800">
                        {t(`role.${account.roleKey}`)}
                      </span>
                      <code className="text-[11px] text-brand-700">
                        {account.email}
                      </code>
                    </div>
                    <p className="text-ink-500">{t(`demo.${account.roleKey}`)}</p>
                  </li>
                ))}
              </ul>
            </details>
          )}

          <div className="mt-6 flex items-center justify-center gap-2 text-xs text-ink-500">
            <span>{t("app.language")}</span>
            <LanguageSwitch locale={locale} />
          </div>
        </div>
      </section>
    </main>
  );
}
