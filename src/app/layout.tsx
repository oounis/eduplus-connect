import type { Metadata } from "next";
import "./globals.css";
import { getLocale } from "@/lib/locale";
import { LOCALE_META } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "EduPlus Connect",
  description: "School management platform — attendance, observations and staff coordination",
  // The Kogia whale in the EduPlus lane: generated from brand/kogia-mark.svg,
  // synced by scripts/sync-kogia-assets.mjs.
  icons: { icon: "/kogia/tile.svg" },
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Language and direction come from the locale cookie, so the whole shell
  // mirrors for Arabic without duplicating any route.
  const locale = await getLocale();
  const { dir, htmlLang } = LOCALE_META[locale];

  return (
    // data-kogia-product: EduPlus Connect is a Kogia World product lane.
    <html lang={htmlLang} dir={dir} data-kogia-product="eduplus">
      <body>{children}</body>
    </html>
  );
}
