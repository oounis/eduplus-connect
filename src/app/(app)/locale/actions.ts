"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { LOCALE_COOKIE, isLocale } from "@/lib/i18n";

/**
 * Switch interface language. A cookie rather than a URL segment, so no route
 * duplicates and every existing link keeps working.
 */
export async function setLocale(formData: FormData) {
  const next = String(formData.get("locale") ?? "");
  if (!isLocale(next)) return;

  const jar = await cookies();
  jar.set(LOCALE_COOKIE, next, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    httpOnly: false, // read by nothing sensitive; a preference, not a credential
  });

  // The whole shell changes direction, so revalidate from the root.
  revalidatePath("/", "layout");
}
