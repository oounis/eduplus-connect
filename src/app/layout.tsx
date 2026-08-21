import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EduPlus Connect",
  description: "School management platform — attendance, observations and staff coordination",
  // The Kogia whale in the EduPlus lane: generated from brand/kogia-mark.svg,
  // synced by scripts/sync-kogia-assets.mjs.
  icons: { icon: "/kogia/tile.svg" },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // data-kogia-product: EduPlus Connect is a Kogia World product lane.
    <html lang="en" data-kogia-product="eduplus">
      <body>{children}</body>
    </html>
  );
}
