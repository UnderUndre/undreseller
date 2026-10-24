/**
 * i18n Scaffold (T012, FR-411/412/413, research D1)
 * next-intl request config + locale resolution chain:
 *   user override (UserPreference) > Telegram `language_code` > session cookie > instance default
 * Locales: ru/en in release; uk post-launch is data-only (NFR-406).
 */

export const I18N_LOCALES = ['ru', 'en'] as const;
export type I18nLocale = (typeof I18N_LOCALES)[number];
export const I18N_DEFAULT_LOCALE: I18nLocale = 'en';

export const I18N_NAMESPACES = [
  'web',
  'clientBot',
  'staffBot',
  'admin',
  'email',
] as const;

export function isSupportedLocale(value: string | null | undefined): value is I18nLocale {
  return !!value && (I18N_LOCALES as readonly string[]).includes(value);
}

/**
 * Telegram language_code → supported locale. Unknown codes fall back to the
 * instance default (`de` → default per US3 scenarios). BCP-47 prefixes are
 * normalized (`ru-RU` → `ru`).
 */
export function normalizeLocale(code: string | null | undefined): I18nLocale | null {
  if (!code) return null;
  const base = code.toLowerCase().split('-')[0];
  return isSupportedLocale(base) ? base : null;
}

export interface LocaleResolutionInput {
  /** UserPreference.languageOverride (anonymous-web fallback: session cookie value). */
  override?: string | null;
  /** Telegram `from.language_code`. */
  languageCode?: string | null;
  /** Anonymous web session cookie (`NEXT_LOCALE`). */
  cookieLocale?: string | null;
  /** ShopSettings.defaultLocale (instance default). */
  instanceDefault?: string | null;
}

/**
 * FR-412 resolution chain. Returns the first supported locale found, else 'en'.
 */
export function resolveLocale(input: LocaleResolutionInput): I18nLocale {
  const chain = [
    normalizeLocale(input.override),
    normalizeLocale(input.languageCode),
    normalizeLocale(input.cookieLocale),
    normalizeLocale(input.instanceDefault),
  ];
  return chain.find((l): l is I18nLocale => l !== null) ?? I18N_DEFAULT_LOCALE;
}

/** Cookie name for the anonymous-web locale fallback (T043). */
export const NEXT_LOCALE_COOKIE = 'NEXT_LOCALE';
