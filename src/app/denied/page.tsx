import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getT } from "@/lib/locale";

export default async function DeniedPage() {
  const user = await requireUser();
  const t = await getT();
  return (
    // data-page: Next renders this in place of the page the user asked for,
    // with a 200, so a status code cannot tell "denied" from "granted".
    // The smoke test reads this marker instead.
    <main
      data-page="denied"
      className="flex min-h-screen items-center justify-center px-6"
    >
      <div className="card max-w-md px-8 py-10 text-center">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-red-50 text-lg text-red-600">
          !
        </div>
        <h1 className="mt-4 text-lg font-semibold text-ink-900">
          {t("denied.title")}
        </h1>
        <p className="mt-2 text-sm text-ink-500">
          {t("denied.body")} ({t(`role.${user.role}`)})
        </p>
        <Link href="/dashboard" className="btn-primary mt-6 inline-flex">
          {t("action.backToDashboard")}
        </Link>
      </div>
    </main>
  );
}
