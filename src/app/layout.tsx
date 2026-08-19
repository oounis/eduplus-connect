import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EduPlus Connect",
  description: "School management platform — attendance, observations and staff coordination",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
