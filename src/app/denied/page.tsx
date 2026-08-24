import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getT } from "@/lib/locale";

export default async function DeniedPage() {
  const user = await requireUser();
  const t = await getT();
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="card max-w-md px-8 py-10 text-center">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-red-50 text-lg text-red-600">
          !
        </div>
        <h1 className="mt-4 text-lg font-semibold text-ink-900">
          {t("denied.title")}
        </h1>
        <p className="mt-2 text-sm text-ink-500">
          Your role ({user.role.toLowerCase()}) has not been granted this
          module. An administrator can change that under Access rights.
        </p>
        <Link href="/dashboard" className="btn-primary mt-6 inline-flex">
          {t("action.backToDashboard")}
        </Link>
      </div>
    </main>
  );
}
