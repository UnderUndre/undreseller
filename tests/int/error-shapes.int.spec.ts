import { describe, expect, it } from 'vitest'

import {
  validateEndTimeAfterStart,
  validateScheduleVersion,
} from '@/collections/SlotReservations'
import { assertProviderAmountMatch } from '@/lib/payments/invariants'

/**
 * Minimal error-shape snapshot suite (spec 001-reinit FR-108 / TC-001-018):
 * freezes the deterministic failure shapes of pure validators so downstream
 * API-error contracts stay stable (legacy `api-error-shapes.snapshot.test.ts`
 * canon, rebuilt for the Payload rails).
 */

describe('validation error shapes (frozen contracts)', () => {
  it('SlotReservations.endTime rejects inverted ranges with a stable message', () => {
    const result = validateEndTimeAfterStart('2026-01-01T10:00:00.000Z', {
      data: { startTime: '2026-01-01T11:00:00.000Z' },
    })
    expect(result).toBe('endTime must be after startTime')
  })

  it('SlotReservations.endTime accepts a valid range', () => {
    expect(
      validateEndTimeAfterStart('2026-01-01T12:00:00.000Z', {
        data: { startTime: '2026-01-01T11:00:00.000Z' },
      })
    ).toBe(true)
  })

  it('SlotReservations.scheduleVersion rejects < 1 with a stable message', () => {
    expect(validateScheduleVersion(0)).toBe('scheduleVersion must be an integer >= 1')
    expect(validateScheduleVersion(1.5)).toBe('scheduleVersion must be an integer >= 1')
    expect(validateScheduleVersion(1)).toBe(true)
  })

  it('payment invariant verdict shapes are frozen', () => {
    expect.assertions(4)
    expect(assertProviderAmountMatch({
      provider: 'STRIPE', amountMinor: 10000, currency: 'USD', order: { totalMinor: 10000, currency: 'USD' },
    })).toStrictEqual({ matches: true })
    expect(assertProviderAmountMatch({
      provider: 'STRIPE', amountMinor: 9999, currency: 'USD', order: { totalMinor: 10000, currency: 'USD' },
    })).toStrictEqual({ matches: false, reason: 'AMOUNT_MISMATCH' })
    expect(assertProviderAmountMatch({
      provider: 'STRIPE', amountMinor: 10000, currency: 'EUR', order: { totalMinor: 10000, currency: 'USD' },
    })).toStrictEqual({ matches: false, reason: 'CURRENCY_MISMATCH' })
    expect(assertProviderAmountMatch({
      provider: 'STRIPE', amountMinor: 10000, currency: 'USD', order: {},
    })).toStrictEqual({ matches: false, reason: 'MISSING_ORDER_AMOUNT' })
  })
})
