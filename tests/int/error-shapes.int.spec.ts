import { describe, expect, it } from 'vitest'

import {
  validateEndTimeAfterStart,
  validateScheduleVersion,
} from '@/collections/SlotReservations'
import { assertProviderAmountMatch } from '@/lib/payments/invariants'
import { IntentError } from '@/lib/booking/intentService'

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

  it('007 error catalog shapes and status codes are frozen (F-TQ-05)', () => {
    const errCap = new IntentError('INTENT_CAP', 429, 'Max 2 live verification requests per email')
    expect({ code: errCap.code, status: errCap.status, message: errCap.message }).toStrictEqual({
      code: 'INTENT_CAP',
      status: 429,
      message: 'Max 2 live verification requests per email',
    })

    const errDead = new IntentError('INTENT_DEAD', 403, 'Too many invalid code attempts')
    expect({ code: errDead.code, status: errDead.status, message: errDead.message }).toStrictEqual({
      code: 'INTENT_DEAD',
      status: 403,
      message: 'Too many invalid code attempts',
    })

    const errOtp = new IntentError('OTP_INVALID', 403, 'Invalid verification code')
    expect({ code: errOtp.code, status: errOtp.status, message: errOtp.message }).toStrictEqual({
      code: 'OTP_INVALID',
      status: 403,
      message: 'Invalid verification code',
    })

    const errBlacklist = new IntentError('BLACKLISTED', 403, 'This phone is not allowed to book')
    expect({ code: errBlacklist.code, status: errBlacklist.status, message: errBlacklist.message }).toStrictEqual({
      code: 'BLACKLISTED',
      status: 403,
      message: 'This phone is not allowed to book',
    })

    const errConsumed = new IntentError('INTENT_CONSUMED', 409, 'This verification request is already completed')
    expect({ code: errConsumed.code, status: errConsumed.status, message: errConsumed.message }).toStrictEqual({
      code: 'INTENT_CONSUMED',
      status: 409,
      message: 'This verification request is already completed',
    })

    const errRate = new IntentError('RATE_LIMITED', 429, 'Too many verification requests', 45)
    expect({
      code: errRate.code,
      status: errRate.status,
      message: errRate.message,
      retryAfterSec: errRate.retryAfterSec,
    }).toStrictEqual({
      code: 'RATE_LIMITED',
      status: 429,
      message: 'Too many verification requests',
      retryAfterSec: 45,
    })
  })
})
