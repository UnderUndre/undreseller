/**
 * Time helpers for the availability engine: Date ↔ "minutes from the start of
 * the zoned date" conversions with a FIXED per-date offset (DST-safe by
 * construction — the offset is derived from the concrete date, spec 002 US4).
 */
export function zonedDateWeekdayISO(dateStr: string): number {
  // Wall date → ISO weekday (1 = Monday … 7 = Sunday), independent of TZ.
  const d = new Date(dateStr + 'T00:00:00Z')
  return ((d.getUTCDay() + 6) % 7) + 1
}

/** Offset of `timeZone` from UTC in minutes on the given wall date. */
export function tzOffsetMinutes(dateStr: string, timeZone: string): number {
  const utc = Date.parse(dateStr + 'T12:00:00Z')
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const parts = Object.fromEntries(
    dtf.formatToParts(new Date(utc)).map((p) => [p.type, p.value]),
  ) as Record<string, string>
  const asUTC = Date.UTC(
    +parts.year,
    +parts.month - 1,
    +parts.day,
    +parts.hour % 24,
    +parts.minute,
    +parts.second,
  )
  return Math.round((asUTC - utc) / 60000)
}

/** UTC instant of `dateStr` at wall-clock `minuteOfDay` in `timeZone`. */
export function zonedToUtc(dateStr: string, minuteOfDay: number, timeZone: string): Date {
  const naive = Date.parse(dateStr + 'T00:00:00Z') + minuteOfDay * 60_000
  return new Date(naive - tzOffsetMinutes(dateStr, timeZone) * 60_000)
}

/** Wall-clock minute-of-day (in `timeZone`) of an instant, relative to `dateStr`. */
export function utcToMinuteOfDay(dateStr: string, instant: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
  const parts = Object.fromEntries(dtf.formatToParts(instant).map((p) => [p.type, p.value]))
  const wallDate = `${parts.year}-${parts.month}-${parts.day}`
  if (wallDate !== dateStr) {
    // Interval touches a neighbouring zoned day — caller clamps.
    return instant.getTime() < Date.parse(dateStr + 'T00:00:00Z') ? -1 : 1441
  }
  return +parts.hour * 60 + +parts.minute
}
