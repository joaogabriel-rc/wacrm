/**
 * Single source of truth for the locale catalog.
 *
 * The dictionaries themselves live in `messages/<id>.json` — this
 * module only carries the metadata the UI (settings picker) and the
 * request pipeline (`src/i18n/request.ts`) need.
 *
 * Adding a locale is a two-step change:
 *   1. Add `messages/<id>.json` with every key from `en.json`
 *      (`src/i18n/messages.test.ts` guards the parity).
 *   2. Append an entry below. The order here drives the picker.
 *
 * `messages/ko.json` ships with the upstream project but is not
 * offered here — this deployment supports English and Portuguese.
 * Adding it back is the two steps above, nothing more.
 */

export const LOCALE_IDS = ["en", "pt"] as const;

export type Locale = (typeof LOCALE_IDS)[number];

/**
 * Fallback when neither the cookie nor `NEXT_PUBLIC_APP_LOCALE` names
 * a known locale. English is the source-of-truth catalogue, so it is
 * the only one guaranteed to have every key.
 */
export const DEFAULT_LOCALE: Locale = "en";

/**
 * Cookie carrying the user's picked locale.
 *
 * A cookie rather than localStorage because the dictionary is chosen
 * on the server (`getRequestConfig`) before any client code runs —
 * localStorage isn't readable there, and swapping the catalogue after
 * hydration would flash English on every load.
 */
export const LOCALE_COOKIE = "wacrm.locale";

/** One year. Re-set on every pick, so it never silently expires. */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export interface LocaleMeta {
  id: Locale;
  /** Endonym — shown in the picker, always in the language itself. */
  name: string;
  /** Region/sublabel, in the language itself. */
  region: string;
  flag: string;
}

export const LOCALES: LocaleMeta[] = [
  { id: "en", name: "English", region: "United States", flag: "🇺🇸" },
  { id: "pt", name: "Português", region: "Brasil", flag: "🇧🇷" },
];

export function isLocale(value: unknown): value is Locale {
  return (
    typeof value === "string" && (LOCALE_IDS as readonly string[]).includes(value)
  );
}

/**
 * Resolve the locale for a request. The cookie (the user's explicit
 * pick) wins; `NEXT_PUBLIC_APP_LOCALE` is the deployment-wide default
 * for users who never picked; English is the last resort.
 */
export function resolveLocale(cookieValue?: string | null): Locale {
  if (isLocale(cookieValue)) return cookieValue;
  const envLocale = process.env.NEXT_PUBLIC_APP_LOCALE;
  if (isLocale(envLocale)) return envLocale;
  return DEFAULT_LOCALE;
}
