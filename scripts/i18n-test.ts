/**
 * Keeps the two dictionaries honest.
 *
 *   npx tsx scripts/i18n-test.ts
 *
 * A missing Arabic key silently falls back to English, which looks like a bug
 * to the person reading the screen and like nothing at all to the developer.
 * This test makes that visible.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
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
  if (ar !== en || arabicRange.test(ar)) return false;
  // A value with no Latin letters has nothing to translate — a year like
  // "2027-2028", or a bare placeholder. Identical is correct there, and
  // flagging it would train people to ignore this check.
  return /[A-Za-z]/.test(en);
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

// 8. Every key the code actually calls exists in the dictionary.
//
//    The checks above prove the two dictionaries agree with each other. They
//    say nothing about whether a key a page asks for is in either of them —
//    and a missing key does not throw, it renders the raw key. "pa.lock.foo"
//    in front of a teacher is the failure this catches.
const KEY_CALL = /\bt\(\s*"([a-zA-Z][\w.-]*)"/g;
const known = new Set(allKeys());
const used = new Map<string, string>();

function scan(dir: string) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      scan(full);
    } else if (/\.tsx?$/.test(entry.name)) {
      const source = readFileSync(full, "utf8");
      for (const match of source.matchAll(KEY_CALL)) {
        if (!used.has(match[1])) used.set(match[1], full);
      }
    }
  }
}
scan("src");

// Dynamic keys are built from a known set, so check every value they can take.
for (const status of ["PRESENT", "ABSENT", "LATE", "EXCUSED"]) {
  used.set(`attendance.${status}`, "dynamic");
}
for (const reason of ["no-right", "no-periods", "no-class", "not-assigned", "not-today", "not-live"]) {
  used.set(`pa.lock.${reason}`, "dynamic");
}

const missing = [...used.entries()].filter(
  ([key]) => !known.has(key) && !key.includes("${"),
);
check(
  "every key used in the app exists in the dictionary",
  missing.length === 0,
  missing.length
    ? missing.slice(0, 12).map(([k, f]) => `${k} (${f})`).join(", ")
    : "",
);
console.log(`        ${used.size} keys referenced across src/`);

console.log(`\n  ${failures === 0 ? "all checks passed" : `${failures} failure(s)`}`);
if (failures) process.exitCode = 1;
