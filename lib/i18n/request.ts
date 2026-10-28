/**
 * next-intl request configuration (T012/T040).
 * App Router integration: wires getRequestConfig to the resolveLocale chain.
 * Locale resolution for the web chrome (FR-412):
 *   requestLocale (set by routing, if any)
 *   > NEXT_LOCALE session cookie (anonymous-web override, T043)
 *   > ShopSettings.defaultLocale (instance default)
 *   > built-in default 'en'
 * Owner content stays authored (FR-414) — chrome only rides these messages.
 */

import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import {
  I18N_DEFAULT_LOCALE,
  I18nLocale,
  NEXT_LOCALE_COOKIE,
  isSupportedLocale,
} from './config';

async function resolveInstanceDefault(): Promise<I18nLocale> {
  // ShopSettings.defaultLocale is the instance default. Wrapped in try/catch:
  // the request config must never break rendering (e.g. during build-time
  // evaluation or DB hiccups) — fall back to the built-in default.
  try {
    const { prisma } = await import('@/lib/db/prisma');
    const settings = await prisma.shopSettings.findUnique({
      where: { id: 1 },
      select: { defaultLocale: true },
    });
    if (isSupportedLocale(settings?.defaultLocale)) return settings.defaultLocale;
  } catch {
    // fall through to built-in default
  }
  return I18N_DEFAULT_LOCALE;
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  let locale: I18nLocale;
  if (isSupportedLocale(requested)) {
    locale = requested;
  } else {
    const cookieLocale = (await cookies()).get(NEXT_LOCALE_COOKIE)?.value;
    locale = isSupportedLocale(cookieLocale) ? cookieLocale : await resolveInstanceDefault();
  }

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
