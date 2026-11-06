import { describe, expect, it } from 'vitest'

import {
  assertProviderAmountMatch,
  assertValidInvoiceAmount,
  expectedStarsPrice,
} from '@/lib/payments/invariants'

describe('assertValidInvoiceAmount (minor-units invariant, TC-001-015 BVA)', () => {
  it('rejects 0, negatives and non-integers', () => {
    expect(() => assertValidInvoiceAmount(0)).toThrow()
    expect(() => assertValidInvoiceAmount(-1)).toThrow()
    expect(() => assertValidInvoiceAmount(10.5)).toThrow()
    expect(() => assertValidInvoiceAmount(Number.NaN)).toThrow()
  })

  it('accepts positive integers', () => {
    expect(() => assertValidInvoiceAmount(1)).not.toThrow()
    expect(() => assertValidInvoiceAmount(10000)).not.toThrow()
  })
})

describe('assertProviderAmountMatch — fiat providers (Stripe / CRYPTO_GATEWAY)', () => {
  const fiatOrder = { totalMinor: 10000, currency: 'USD' }

  it('fiat match → verdict matches (legacy happy-path parity)', () => {
    expect(
      assertProviderAmountMatch({ provider: 'STRIPE', amountMinor: 10000, currency: 'USD', order: fiatOrder })
    ).toEqual({ matches: true })
  })

  it('fiat 1-minor underpay → AMOUNT_MISMATCH (legacy BVA parity)', () => {
    expect(
      assertProviderAmountMatch({ provider: 'CRYPTO_GATEWAY', amountMinor: 9999, currency: 'USD', order: fiatOrder })
    ).toEqual({ matches: false, reason: 'AMOUNT_MISMATCH' })
  })

  it('fiat currency mismatch (EUR vs USD) → CURRENCY_MISMATCH (legacy parity)', () => {
    expect(
      assertProviderAmountMatch({ provider: 'STRIPE', amountMinor: 10000, currency: 'EUR', order: fiatOrder })
    ).toEqual({ matches: false, reason: 'CURRENCY_MISMATCH' })
  })

  it('case-insensitive currency comparison', () => {
    expect(
      assertProviderAmountMatch({
        provider: 'STRIPE',
        amountMinor: 10000,
        currency: 'usd',
        order: { totalMinor: 10000, currency: 'USD' },
      })
    ).toEqual({ matches: true })
  })

  it('missing order amount (neither totalMinor nor amount) → MISSING_ORDER_AMOUNT', () => {
    expect(
      assertProviderAmountMatch({ provider: 'STRIPE', amountMinor: 10000, currency: 'USD', order: {} })
    ).toEqual({ matches: false, reason: 'MISSING_ORDER_AMOUNT' })
  })

  it('polymorphism F6: Payload Order.amount used when totalMinor is absent', () => {
    expect(
      assertProviderAmountMatch({
        provider: 'STRIPE',
        amountMinor: 10000,
        currency: 'USD',
        order: { amount: 10000, currency: 'USD' },
      })
    ).toEqual({ matches: true })
    expect(
      assertProviderAmountMatch({
        provider: 'STRIPE',
        amountMinor: 9999,
        currency: 'USD',
        order: { amount: 10000, currency: 'USD' },
      })
    ).toEqual({ matches: false, reason: 'AMOUNT_MISMATCH' })
  })
})

describe('assertProviderAmountMatch — Telegram Stars (XTR, legacy 007 canon)', () => {
  const starsOrder = { totalMinor: 10000, currency: 'USD' }

  it('canonical Stars calc (totalMinor/2 = 5000 XTR) matches → PAID-equivalent', () => {
    expect(
      assertProviderAmountMatch({ provider: 'TELEGRAM_STARS', amountMinor: 5000, currency: 'XTR', order: starsOrder })
    ).toEqual({ matches: true })
  })

  it('1 star short → AMOUNT_MISMATCH (legacy TC-007-010b parity)', () => {
    expect(
      assertProviderAmountMatch({ provider: 'TELEGRAM_STARS', amountMinor: 4999, currency: 'XTR', order: starsOrder })
    ).toEqual({ matches: false, reason: 'AMOUNT_MISMATCH' })
  })

  it('non-XTR currency on Stars provider → CURRENCY_MISMATCH (legacy 007 F1 parity)', () => {
    expect(
      assertProviderAmountMatch({ provider: 'TELEGRAM_STARS', amountMinor: 5000, currency: 'USD', order: starsOrder })
    ).toEqual({ matches: false, reason: 'CURRENCY_MISMATCH' })
  })

  it('explicit starsPrice overrides the /2 calculation', () => {
    expect(expectedStarsPrice({ starsPrice: 777, totalMinor: 10000 })).toBe(777)
    expect(
      assertProviderAmountMatch({
        provider: 'TELEGRAM_STARS',
        amountMinor: 777,
        currency: 'XTR',
        order: { starsPrice: 777, totalMinor: 10000, currency: 'USD' },
      })
    ).toEqual({ matches: true })
  })

  it('tiny order floors at 1 star', () => {
    expect(expectedStarsPrice({ totalMinor: 1 })).toBe(1)
  })
})
