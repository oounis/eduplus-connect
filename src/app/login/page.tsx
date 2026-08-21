import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import LoginForm from "./login-form";

const DEMO_ACCOUNTS = [
  { role: "Administrator", email: "admin@eduplus.school", note: "Users, access rights, academic setup" },
  { role: "Deputy", email: "deputy@eduplus.school", note: "Staff tasks and school-wide summaries" },
  { role: "Staff", email: "staff@eduplus.school", note: "Own tasks and school-wide summaries" },
  { role: "Supervisor", email: "supervisor@eduplus.school", note: "Daily attendance for assigned classes" },
  { role: "Teacher", email: "teacher@eduplus.school", note: "Daily observations for assigned classes" },
  { role: "Parent", email: "parent@eduplus.school", note: "Own children only" },
  { role: "Student", email: "student@eduplus.school", note: "Own record only" },
];

export default async function LoginPage() {
  if (await getSession()) redirect("/dashboard");

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
              EduPlus Connect
            </span>
          </div>
          <h1 className="mt-10 max-w-md text-3xl font-semibold leading-tight tracking-tight lg:mt-16 lg:text-4xl">
            One place for attendance, observations and the people who run the
            school.
          </h1>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-brand-100">
            Supervisors take the daily register, teachers log observations, and
            administration sees the whole school at a glance — today&apos;s
            attendance and this week&apos;s observations.
          </p>
        </div>

        <dl className="mt-12 grid grid-cols-3 gap-4 border-t border-white/15 pt-6 text-sm">
          <div>
            <dt className="text-brand-200">Roles</dt>
            <dd className="mt-0.5 text-xl font-semibold">7</dd>
          </div>
          <div>
            <dt className="text-brand-200">Modules</dt>
            <dd className="mt-0.5 text-xl font-semibold">10</dd>
          </div>
          <div>
            <dt className="text-brand-200">Access</dt>
            <dd className="mt-0.5 text-xl font-semibold">Per role</dd>
          </div>
        </dl>
      </section>

      {/* Form panel */}
      <section className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <h2 className="text-xl font-semibold tracking-tight text-ink-900">
            Sign in
          </h2>
          <p className="mt-1 text-sm text-ink-500">
            Use your school account to open your dashboard.
          </p>

          <LoginForm />

          <details className="mt-8 rounded-xl border border-ink-200 bg-white p-4">
            <summary className="cursor-pointer text-xs font-semibold text-ink-700">
              Demo accounts (password: Passw0rd!)
            </summary>
            <ul className="mt-3 space-y-2">
              {DEMO_ACCOUNTS.map((account) => (
                <li key={account.email} className="text-xs">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium text-ink-800">
                      {account.role}
                    </span>
                    <code className="text-[11px] text-brand-700">
                      {account.email}
                    </code>
                  </div>
                  <p className="text-ink-500">{account.note}</p>
                </li>
              ))}
            </ul>
          </details>
        </div>
      </section>
    </main>
  );
}
