import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { MODULES, MODULE_META } from "@/lib/constants";
import { getI18n } from "@/lib/locale";
import { LanguageSwitch } from "@/components/language-switch";
import Sidebar, { type NavItem } from "@/components/sidebar";
import { logout } from "../login/actions";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const { locale, t } = await getI18n();

  // Nav labels come from the dictionary, not from MODULE_META, so the sidebar
  // is translated. MODULE_META still owns the href and the icon.
  const items: NavItem[] = MODULES.filter((key) => user.access[key]?.view).map(
    (key) => ({
      key,
      label: t(`module.${key}.label`),
      href: MODULE_META[key].href,
    }),
  );

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <Sidebar
        items={items}
        userName={user.name}
        userRole={t(`role.${user.role}`)}
        roleKey={user.role}
        appName={t("app.name")}
        tagline={t("app.tagline")}
        menuLabel={t("app.menu")}
        closeLabel={t("action.cancel")}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="hidden items-center justify-between border-b border-ink-200 bg-white px-8 py-3 lg:flex">
          <p className="text-sm text-ink-500">
            {t("app.signedInAs")}{" "}
            <span className="font-medium text-ink-800">{user.email}</span>
          </p>
          <div className="flex items-center gap-2">
            <LanguageSwitch locale={locale} />
            <Link href="/profile" className="btn-secondary btn-sm">
              {t("app.myAccount")}
            </Link>
            <form action={logout}>
              <button type="submit" className="btn-secondary btn-sm">
                {t("app.signOut")}
              </button>
            </form>
          </div>
        </header>

        <main className="min-w-0 flex-1 px-5 py-6 lg:px-8 lg:py-8">
          {children}
        </main>

        <footer className="space-y-2 px-5 py-6 lg:hidden">
          <div className="flex justify-center pb-1">
            <LanguageSwitch locale={locale} />
          </div>
          <Link href="/profile" className="btn-secondary block w-full text-center">
            {t("app.myAccount")}
          </Link>
          <form action={logout}>
            <button type="submit" className="btn-secondary w-full">
              {t("app.signOut")}
            </button>
          </form>
        </footer>
      </div>
    </div>
  );
}
