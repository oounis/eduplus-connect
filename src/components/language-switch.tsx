import { LOCALES, LOCALE_META, type Locale } from "@/lib/i18n";
import { setLocale } from "@/app/(app)/locale/actions";

/**
 * Two buttons, not a <select>: with only two languages a select is an extra
 * click, and the inactive language must be readable in its own script so a
 * user who cannot read the current one can still find their way out.
 */
export function LanguageSwitch({ locale }: { locale: Locale }) {
  return (
    <div className="flex items-center gap-1">
      {LOCALES.map((code) => {
        const active = code === locale;
        return (
          <form key={code} action={setLocale}>
            <input type="hidden" name="locale" value={code} />
            <button
              type="submit"
              lang={LOCALE_META[code].htmlLang}
              aria-current={active ? "true" : undefined}
              className={
                active
                  ? "rounded-md bg-brand-600 px-2 py-1 text-xs font-medium text-white"
                  : "rounded-md px-2 py-1 text-xs text-ink-500 hover:bg-ink-50 hover:text-ink-800"
              }
            >
              {LOCALE_META[code].label}
            </button>
          </form>
        );
      })}
    </div>
  );
}
