import { describe, expect, it } from 'vitest'

import {
  computeSlots,
  type BusyIntervalMin,
  type DayException,
  type SlotService,
  type WeeklyWindow,
} from '@/lib/availability/computeSlots'

const service = (durationMin = 60, before = 0, after = 0): SlotService => ({
  durationMin,
  bufferBeforeMin: before,
  bufferAfterMin: after,
})

const weekdayWindow = (
  openMin = 600, // 10:00
  closeMin = 1200, // 20:00
  breakStartMin: number | null = null,
  breakEndMin: number | null = null,
): WeeklyWindow[] => [{ weekday: 3, startMin: openMin, endMin: closeMin, breakStartMin, breakEndMin }]

const base = {
  date: '2026-11-11', // Wednesday
  weekday: 3,
  exceptions: [] as DayException[],
  quantumMin: 30,
}

describe('computeSlots — quantum & grid (TC-002-008)', () => {
  it('45-min service on a 30-min grid → hourly anchor slots only', () => {
    // 10:00–11:00, 10:30–11:30 … 19:00–20:00 → 19 slots
    const slots = computeSlots({ ...base, service: service(45), weeklyHours: weekdayWindow() })
    expect(slots.length).toBe(19)
    expect(slots[0]).toEqual({ startMin: 600, endMin: 645 })
    expect(slots[1]).toEqual({ startMin: 630, endMin: 675 })
  })

  it('60-min service → 19 slots (10:00 … 19:00 — start+60 <= close)', () => {
    const slots = computeSlots({ ...base, service: service(60), weeklyHours: weekdayWindow() })
    expect(slots.length).toBe(19)
    expect(slots.at(-1)).toEqual({ startMin: 1140, endMin: 1200 })
  })
})

describe('computeSlots — buffers inside working hours (F11 invariant, TC-002-010)', () => {
  it('buffer before open makes the earliest slot unavailable', () => {
    // bufferBefore 30 → slot at 10:00 would need 09:30 — unavailable
    const slots = computeSlots({
      ...base,
      service: service(60, 30),
      weeklyHours: weekdayWindow(),
    })
    expect(slots[0]).toEqual({ startMin: 630, endMin: 690 })
  })

  it('buffer after close makes the latest slot unavailable', () => {
    const slots = computeSlots({
      ...base,
      service: service(60, 0, 30),
      weeklyHours: weekdayWindow(),
    })
    expect(slots.at(-1)).toEqual({ startMin: 1110, endMin: 1170 })
  })
})

describe('computeSlots — breaks and busy (TC-002-009, TC-002-010)', () => {
  it('lunch break cuts overlapping slots', () => {
    const slots = computeSlots({
      ...base,
      service: service(60),
      weeklyHours: weekdayWindow(600, 1200, 780, 840), // 13:00–14:00 break
      busy: [] as BusyIntervalMin[],
    })
    const starts = slots.map((s) => s.startMin)
    expect(starts).not.toContain(780) // 13:00 overlaps break
    expect(starts).not.toContain(750) // 12:30–13:30 overlaps break
    expect(starts).toContain(720) // 12:00–13:00 OK
    expect(starts).toContain(840) // 14:00 OK
  })

  it('busy interval (buffer-expanded by resolver) removes overlapping slots', () => {
    const busy: BusyIntervalMin[] = [{ startMin: 690, endMin: 750 }] // 11:30–12:30 busy
    const slots = computeSlots({
      ...base,
      service: service(60),
      weeklyHours: weekdayWindow(),
      busy,
    })
    const starts = slots.map((s) => s.startMin)
    expect(starts).not.toContain(660) // 11:00–12:00 overlaps busy
    expect(starts).not.toContain(690)
    expect(starts).not.toContain(720) // 12:00–13:00 overlaps busy till 12:30
    expect(starts).toContain(600)
    expect(starts).toContain(750)
  })
})

describe('computeSlots — exceptions & closed days (TC-002-012)', () => {
  it('closed-day exception → no slots', () => {
    const slots = computeSlots({
      ...base,
      service: service(60),
      weeklyHours: weekdayWindow(),
      exceptions: [{ date: '2026-11-11', isClosed: true, startMin: null, endMin: null }],
    })
    expect(slots).toEqual([])
  })

  it('partial-day exception replaces the weekly window', () => {
    const slots = computeSlots({
      ...base,
      service: service(60),
      weeklyHours: weekdayWindow(),
      exceptions: [{ date: '2026-11-11', isClosed: false, startMin: 900, endMin: 960 }],
    })
    expect(slots).toEqual([{ startMin: 900, endMin: 960 }])
  })
})

describe('computeSlots — past filter and edge inputs', () => {
  it('nowMin filters past slots (BVA: exactly now is excluded)', () => {
    const slots = computeSlots({
      ...base,
      service: service(60),
      weeklyHours: weekdayWindow(),
      nowMin: 600,
    })
    expect(slots[0]).toEqual({ startMin: 630, endMin: 690 })
  })

  it('no weekly hours for the weekday → no slots', () => {
    const slots = computeSlots({
      ...base,
      weekday: 7,
      service: service(60),
      weeklyHours: weekdayWindow(),
    })
    expect(slots).toEqual([])
  })

  it('non-integer/negative duration → no slots (defensive)', () => {
    expect(computeSlots({ ...base, service: service(0), weeklyHours: weekdayWindow() })).toEqual([])
  })
})
