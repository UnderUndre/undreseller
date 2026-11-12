import { getRequestConfig } from 'next-intl/server'

export const locales = ['ru', 'en'] as const
export type Locale = (typeof locales)[number]
export const defaultLocale: Locale = 'ru'

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale
  const locale = locales.includes(requested as Locale) ? (requested as Locale) : defaultLocale

  return {
    locale,
    messages: (await import(`./locales/${locale}.json`)).default,
  }
})
