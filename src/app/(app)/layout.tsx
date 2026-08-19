import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { MODULES, MODULE_META, ROLE_LABELS } from "@/lib/constants";
import Sidebar, { type NavItem } from "@/components/sidebar";
import { logout } from "../login/actions";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  const items: NavItem[] = MODULES.filter(
    (key) => user.access[key]?.view,
  ).map((key) => ({
    key,
    label: MODULE_META[key].label,
    href: MODULE_META[key].href,
  }));

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <Sidebar
        items={items}
        userName={user.name}
        userRole={ROLE_LABELS[user.role]}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="hidden items-center justify-between border-b border-ink-200 bg-white px-8 py-3 lg:flex">
          <p className="text-sm text-ink-500">
            Signed in as{" "}
            <span className="font-medium text-ink-800">{user.email}</span>
          </p>
          <div className="flex items-center gap-2">
            <Link href="/profile" className="btn-secondary btn-sm">
              My account
            </Link>
            <form action={logout}>
              <button type="submit" className="btn-secondary btn-sm">
                Sign out
              </button>
            </form>
          </div>
        </header>

        <main className="min-w-0 flex-1 px-5 py-6 lg:px-8 lg:py-8">
          {children}
        </main>

        <footer className="space-y-2 px-5 py-6 lg:hidden">
          <Link href="/profile" className="btn-secondary block w-full text-center">
            My account
          </Link>
          <form action={logout}>
            <button type="submit" className="btn-secondary w-full">
              Sign out
            </button>
          </form>
        </footer>
      </div>
    </div>
  );
}
