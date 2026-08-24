"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { MODULE_META, type ModuleKey } from "@/lib/constants";
import { Avatar, KogiaIcon, KogiaTile, TierBadge } from "@/components/kogia";
import type { KogiaIconName } from "@/components/kogia-icon-paths";

export type NavItem = { key: ModuleKey; label: string; href: string };

// Module → icon from the shared Kogia set (60 icons, one geometry everywhere).
const MODULE_ICON: Record<string, KogiaIconName> = {
  grid: "home",
  users: "community",
  shield: "locked",
  calendar: "roadmap",
  school: "education",
  student: "profile",
  link: "partnership",
  check: "verify",
  note: "article",
  task: "project",
  chart: "analytics",
  history: "moderation",
};

export default function Sidebar({
  items,
  userName,
  userRole,
  roleKey,
  appName,
  tagline,
  menuLabel,
  closeLabel,
}: {
  items: NavItem[];
  userName: string;
  userRole: string;
  /** Raw role (ADMIN, TEACHER…) used for the Kogia account level. */
  roleKey: string;
  /** Translated in the layout — this is a client component, so strings arrive as props. */
  appName: string;
  tagline: string;
  menuLabel: string;
  closeLabel: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const nav = (
    <nav className="space-y-0.5">
      {items.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.key}
            href={item.href}
            onClick={() => setOpen(false)}
            className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
              active
                ? "bg-brand-50 font-medium text-brand-700"
                : "text-ink-600 hover:bg-ink-100 hover:text-ink-900"
            }`}
          >
            <KogiaIcon name={MODULE_ICON[MODULE_META[item.key].icon] ?? "home"} size="control" className="shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <>
      {/* Mobile bar */}
      <div className="flex items-center justify-between border-b border-ink-200 bg-white px-4 py-3 lg:hidden">
        <div className="flex items-center gap-2">
          <KogiaTile size={28} />
          <span className="text-sm font-semibold">{appName}</span>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="btn-secondary btn-sm"
          aria-expanded={open}
        >
          {open ? closeLabel : menuLabel}
        </button>
      </div>
      {open && (
        <div className="border-b border-ink-200 bg-white px-3 py-3 lg:hidden">
          {nav}
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-e border-ink-200 bg-white lg:flex">
        <div className="flex items-center gap-2.5 border-b border-ink-200 px-5 py-4">
          <KogiaTile size={32} />
          <div className="leading-tight">
            <p className="text-sm font-semibold tracking-tight">{appName}</p>
            <p className="text-[11px] text-ink-500">{tagline}</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-4">{nav}</div>

        <div className="flex items-center gap-3 border-t border-ink-200 px-5 py-3">
          <Avatar seed={userName} size={36} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink-800">{userName}</p>
            <p className="text-xs text-ink-500">{userRole}</p>
          </div>
          <TierBadge role={roleKey} size={30} />
        </div>
      </aside>
    </>
  );
}
