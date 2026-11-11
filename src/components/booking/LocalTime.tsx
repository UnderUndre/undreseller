'use client'

import { useEffect, useState } from 'react'

/**
 * Client-side localized date/time formatter (spec 008 T830 / F-UX-01):
 * formats timestamps in the user's browser timezone/locale after hydration,
 * preventing server-side timezone mismatches (e.g. UTC server rendering).
 */
export function LocalTime({ iso, endIso }: { iso: string; endIso?: string }) {
  const [formatted, setFormatted] = useState('')

  useEffect(() => {
    const d = new Date(iso)
    if (endIso) {
      const endD = new Date(endIso)
      setFormatted(`${d.toLocaleString()} — ${endD.toLocaleTimeString()}`)
    } else {
      setFormatted(d.toLocaleString())
    }
  }, [iso, endIso])

  return (
    <span suppressHydrationWarning>
      {formatted || new Date(iso).toLocaleString('en-US', { timeZone: 'UTC' })}
    </span>
  )
}
