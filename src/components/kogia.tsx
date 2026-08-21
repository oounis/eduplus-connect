import Image from "next/image";
import { KOGIA_AVATARS, KOGIA_ICONS, type KogiaIconName } from "./kogia-icon-paths";

/**
 * EduPlus Connect is a Kogia World product. Everything visual that is shared
 * across Kogia (the whale mark, account levels, loaders, character avatars,
 * the icon set) comes from the Kogia package via scripts/sync-kogia-assets.mjs.
 * These are the only components that render it.
 */

export const ICON_SIZES = { inline: 16, control: 18, nav: 20, feature: 24 } as const;

export function KogiaIcon({
  name,
  size = "nav",
  label,
  className,
}: {
  name: KogiaIconName;
  size?: keyof typeof ICON_SIZES | number;
  /** Required when the icon carries meaning alone (icon-only button). */
  label?: string;
  className?: string;
}) {
  const px = typeof size === "number" ? size : ICON_SIZES[size];
  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      role={label ? "img" : undefined}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      focusable="false"
      dangerouslySetInnerHTML={{ __html: KOGIA_ICONS[name] }}
    />
  );
}

/** Deterministic character for a person: same name, same whale, every time. */
export function avatarFor(seed: string): string {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return KOGIA_AVATARS[h % KOGIA_AVATARS.length];
}

export function Avatar({ seed, size = 36, className = "" }: { seed: string; size?: number; className?: string }) {
  return (
    <Image
      src={`/kogia/avatars/${avatarFor(seed)}.png`}
      alt=""
      width={size}
      height={size}
      className={`shrink-0 rounded-full border border-brand-200 bg-brand-50 ${className}`}
    />
  );
}

/** Account level, read from the role: the school's leadership is "expert",
 *  supervisors and deputies "pro", everyone else starts as "amateur". */
export type Tier = "amateur" | "pro" | "expert";
export function tierFor(role: string): Tier {
  if (role === "ADMIN") return "expert";
  if (role === "DEPUTY" || role === "SUPERVISOR") return "pro";
  return "amateur";
}
export const TIER_LABELS: Record<Tier, string> = { amateur: "Amateur", pro: "Pro", expert: "Expert" };

export function TierBadge({ role, size = 28 }: { role: string; size?: number }) {
  const tier = tierFor(role);
  return (
    <Image
      src={`/kogia/tiers/${tier}.svg`}
      unoptimized
      alt={`${TIER_LABELS[tier]} account`}
      title={`${TIER_LABELS[tier]} account`}
      width={size}
      height={size}
      className="shrink-0"
    />
  );
}

/** The whale loaders. A loader always comes with words. */
export function Loader({
  kind = "sillage",
  label = "Loading…",
  size = 56,
}: {
  kind?: "souffle" | "echo" | "sillage" | "plongee" | "surface" | "nage";
  label?: string;
  size?: number;
}) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col items-center gap-3 py-10 text-sm text-ink-500">
      <Image src={`/kogia/loaders/${kind}.svg`} alt="" width={size} height={size} unoptimized />
      <span>{label}</span>
    </div>
  );
}

export function KogiaTile({ size = 32, className = "" }: { size?: number; className?: string }) {
  return <Image src="/kogia/tile.svg" alt="" width={size} height={size} unoptimized className={`rounded-lg ${className}`} />;
}
