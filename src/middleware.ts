import createMiddleware from 'next-intl/middleware'

import { locales, defaultLocale } from './i18n/request'

/**
 * Locale detection + redirect middleware (spec 010-i18n):
 * 1. Cookie `NEXT_LOCALE` wins (user's explicit choice)
 * 2. Accept-Language header (browser preference)
 * 3. Default locale (`ru`)
 *
 * Payload admin (`/admin`) and API routes (`/api`) are NOT localized —
 * they pass through unchanged.
 */
export default createMiddleware({
  locales,
  defaultLocale,
  localePrefix: 'always',
})

export const config = {
  matcher: ['/((?!api|_next|_vercel|admin|.*\\..*).*)'],
}
