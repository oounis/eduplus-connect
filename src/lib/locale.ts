import { cookies } from "next/headers";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  isLocale,
  translator,
  type Locale,
  type T,
} from "./i18n";

/**
 * Server-side locale access. Split from `i18n.ts` so that file stays free of
 * `next/headers` and can be imported by client components and by scripts.
 */

export async function getLocale(): Promise<Locale> {
  const jar = await cookies();
  const value = jar.get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

/** `const t = await getT()` in any server component. */
export async function getT(): Promise<T> {
  return translator(await getLocale());
}

/** Both at once, for components that also need `dir`. */
export async function getI18n(): Promise<{ locale: Locale; t: T }> {
  const locale = await getLocale();
  return { locale, t: translator(locale) };
}
