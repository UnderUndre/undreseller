'use client'

import { useEffect, useState } from 'react'
import { useLocale } from 'next-intl'

/**
 * Client-side localized date/time formatter (spec 008 T830 / F-UX-01; i18n per
 * spec 010): formats timestamps in the user's browser timezone using the
 * next-intl locale from the URL prefix (`/ru/...` → ru-RU, `/en/...` → en-US).
 */
export function LocalTime({ iso, endIso }: { iso: string; endIso?: string }) {
  const locale = useLocale()
  const [formatted, setFormatted] = useState('')

  useEffect(() => {
    const localeTag = locale === 'ru' ? 'ru-RU' : 'en-US'
    const d = new Date(iso)
    if (endIso) {
      const endD = new Date(endIso)
      setFormatted(`${d.toLocaleString(localeTag)} — ${endD.toLocaleTimeString(localeTag)}`)
    } else {
      setFormatted(d.toLocaleString(localeTag))
    }
  }, [iso, endIso, locale])

  return (
    <span suppressHydrationWarning>
      {formatted || new Date(iso).toLocaleString('en-US', { timeZone: 'UTC' })}
    </span>
  )
}
