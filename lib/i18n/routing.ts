/**
 * next-intl routing definition (T012): locale-prefixed routing is NOT used —
 * this is a single-domain white-label instance; locale rides cookies/DB, not URLs.
 */

import { defineRouting } from 'next-intl/routing';
import { I18N_LOCALES, I18N_DEFAULT_LOCALE, NEXT_LOCALE_COOKIE } from './config';

export const routing = defineRouting({
  locales: [...I18N_LOCALES],
  defaultLocale: I18N_DEFAULT_LOCALE,
  localeCookie: {
    name: NEXT_LOCALE_COOKIE,
  },
  localePrefix: 'never',
});
