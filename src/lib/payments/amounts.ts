import { assertValidInvoiceAmount } from '@/lib/payments/invariants'

/**
 * Deposit amount conversion (spec 003-no-show-protection T310, research D4):
 * products denominate in whole USD (`priceInUSD`); the Stripe money path and the
 * legacy invariants module (001) require positive integer minor units.
 * `Math.round` guards against float drift (19.99 × 100 → 1998.999…).
 */
export function toAmountMinor(priceInUSD: number): number {
  if (typeof priceInUSD !== 'number' || Number.isNaN(priceInUSD) || priceInUSD <= 0) {
    throw new Error(`Invalid priceInUSD: ${String(priceInUSD)} (must be a positive number)`)
  }
  const amountMinor = Math.round(priceInUSD * 100)
  assertValidInvoiceAmount(amountMinor)
  return amountMinor
}

/**
 * Cutoff boundary (spec 003 FR-304, review F13): strictly exclusive —
 * a customer cancel auto-refunds only while `now < start - cutoffHours`;
 * at exactly the boundary (`now >= …`) the staff-resolution path applies.
 */
export function isBeforeCancellationCutoff(params: {
  start: Date
  cancellationCutoffHours: number
  now: Date
}): boolean {
  const cutoffAt = params.start.getTime() - params.cancellationCutoffHours * 60 * 60 * 1000
  return params.now.getTime() < cutoffAt
}
