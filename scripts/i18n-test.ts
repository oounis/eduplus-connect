/**
 * Keeps the two dictionaries honest.
 *
 *   npx tsx scripts/i18n-test.ts
 *
 * A missing Arabic key silently falls back to English, which looks like a bug
 * to the person reading the screen and like nothing at all to the developer.
 * This test makes that visible.
 */
import {
  LOCALES,
  LOCALE_META,
  allKeys,
  missingKeys,
  staleKeys,
  translate,
  isLocale,
  dirFor,
} from "../src/lib/i18n";

let failures = 0;
function check(name: string, pass: boolean, detail = "") {
  console.log(`${pass ? "  PASS" : "  FAIL"}  ${name}`);
  if (!pass) {
    if (detail) console.log(`        ${detail}`);
    failures += 1;
  }
}

// 1. Every English key has an Arabic translation.
const missingAr = missingKeys("ar");
check(
  "every English key is translated into Arabic",
  missingAr.length === 0,
  missingAr.length ? `${missingAr.length} missing: ${missingAr.slice(0, 8).join(", ")}` : "",
);

// 2. No leftover Arabic keys that English has dropped.
const staleAr = staleKeys("ar");
check(
  "no stale Arabic keys",
  staleAr.length === 0,
  staleAr.length ? `${staleAr.length} stale: ${staleAr.slice(0, 8).join(", ")}` : "",
);

// 3. Every Arabic value differs from the English one, or at least contains
//    Arabic script. Catches a key that was copied across but never translated.
const arabicRange = /[\u0600-\u06FF]/;
const untranslated = allKeys().filter((key) => {
  const ar = translate("ar", key);
  const en = translate("en", key);
  return ar === en && !arabicRange.test(ar);
});
check(
  "every Arabic value is actually translated",
  untranslated.length === 0,
  untranslated.length
    ? `${untranslated.length} untranslated: ${untranslated.slice(0, 10).join(", ")}`
    : "",
);

// 4. Direction and lang are right for each locale.
check("English is left-to-right", dirFor("en") === "ltr");
check("Arabic is right-to-left", dirFor("ar") === "rtl");
check(
  "each locale declares an html lang",
  LOCALES.every((l) => LOCALE_META[l].htmlLang.length >= 2),
);

// 5. Placeholder interpolation works, and an unknown placeholder is left visible
//    rather than printing "undefined".
check(
  "placeholders interpolate",
  translate("en", "students.allOf", { name: "2026-2027" }) ===
    "All students of 2026-2027.",
  translate("en", "students.allOf", { name: "2026-2027" }),
);
check(
  "a missing placeholder stays visible",
  translate("en", "students.allOf").includes("{name}"),
);

// 6. An unknown key returns itself, never throws.
check("an unknown key does not throw", translate("ar", "no.such.key") === "no.such.key");

// 7. isLocale guards the cookie value.
check(
  "isLocale rejects rubbish",
  isLocale("en") && isLocale("ar") && !isLocale("fr") && !isLocale(undefined),
);

console.log(`\n  ${failures === 0 ? "all checks passed" : `${failures} failure(s)`}`);
if (failures) process.exitCode = 1;
