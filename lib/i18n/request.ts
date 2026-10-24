/**
 * next-intl request configuration (T012).
 * App Router integration: wires getRequestConfig to the resolveLocale chain.
 */

import { getRequestConfig } from 'next-intl/server';
import { I18N_LOCALES, I18N_DEFAULT_LOCALE, type I18nLocale, isSupportedLocale } from './config';

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale: I18nLocale = isSupportedLocale(requested) ? requested : I18N_DEFAULT_LOCALE;

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
