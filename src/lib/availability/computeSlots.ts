/**
 * Pure slot computation (spec 002-booking-domain US4, research D3, NFR-205):
 * NO IO, NO clock — everything arrives as data. All intervals are
 * "minutes from the start of the zoned date" (the resolver converts
 * Date ↔ minute-space using the fixed offset of ShopSettings.timeZone).
 *
 * The buffer invariant (antigravity F11): a candidate slot occupies
 * [start − bufferBefore, end + bufferAfter]; this whole span must fit inside
 * the working window and stay clear of breaks and busy intervals
 * (busy intervals arrive ALREADY expanded by their own reservation buffers).
 */

export interface WeeklyWindow {
  weekday: number
  startMin: number
  endMin: number
  breakStartMin: number | null
  breakEndMin: number | null
}

export interface DayException {
  date: string
  isClosed: boolean
  startMin: number | null
  endMin: number | null
}

export interface SlotService {
  durationMin: number
  bufferBeforeMin: number
  bufferAfterMin: number
}

export interface BusyIntervalMin {
  startMin: number
  endMin: number
}

export interface ComputeSlotsInput {
  date: string
  weekday: number
  service: SlotService
  weeklyHours: WeeklyWindow[]
  exceptions: DayException[]
  busy?: BusyIntervalMin[]
  quantumMin: number
  /** Injected clock — slots in the past are filtered out when provided. */
  nowMin?: number
}

export interface ComputedSlot {
  startMin: number
  endMin: number
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && aEnd > bStart
}

export function computeSlots(input: ComputeSlotsInput): ComputedSlot[] {
  const { date, weekday, service, weeklyHours, exceptions, quantumMin } = input
  const busy = input.busy ?? []
  const duration = service.durationMin
  if (!Number.isInteger(duration) || duration < 5) return []

  // Day windows: exception wins over weekly hours (closed → no slots;
  // partial-day exception replaces the window).
  const exception = exceptions.find((e) => e.date === date)
  let windows: { openMin: number; closeMin: number; breaks: { s: number; e: number }[] }[] = []
  if (exception) {
    if (exception.isClosed) return []
    if (exception.startMin != null && exception.endMin != null) {
      windows = [{ openMin: exception.startMin, closeMin: exception.endMin, breaks: [] }]
    }
  } else {
    windows = weeklyHours
      .filter((w) => w.weekday === weekday)
      .map((w) => ({
        openMin: w.startMin,
        closeMin: w.endMin,
        breaks:
          w.breakStartMin != null && w.breakEndMin != null
            ? [{ s: w.breakStartMin, e: w.breakEndMin }]
            : [],
      }))
  }

  const slots: ComputedSlot[] = []
  for (const window of windows) {
    for (
      let startMin = window.openMin;
      startMin + duration <= window.closeMin;
      startMin += quantumMin
    ) {
      const endMin = startMin + duration
      const before = startMin - service.bufferBeforeMin
      const after = endMin + service.bufferAfterMin
      // Buffer invariant (F11): the whole buffered span must fit the window.
      if (before < window.openMin || after > window.closeMin) continue
      // Break cut.
      if (window.breaks.some((b) => overlaps(before, after, b.s, b.e))) continue
      // Busy overlap (busy already buffer-expanded by the resolver).
      if (busy.some((b) => overlaps(before, after, b.startMin, b.endMin))) continue
      // Past filter (minute-of-day of `now` on this date).
      if (input.nowMin != null && startMin <= input.nowMin) continue
      slots.push({ startMin, endMin })
    }
  }
  return slots
}
