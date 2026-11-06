/**
 * Payment amount invariants — pure money-path guards (spec 001-reinit US6, FR-107;
 * design reference: legacy `lib/payments/providerContract.ts` + `fulfillment.ts`,
 * including the 007 F1–F6 provider-aware remediation).
 *
 * No IO, no ORM — callers translate provider wire formats into the flat input and
 * act on the verdict. The Stripe checkout path of the template is NOT touched by
 * this module; the pluggable `PaymentAdapter` interface is the extension surface
 * for Telegram Stars / NOWPayments adapters in spec 004+.
 */

/** Registry minor-units invariant (legacy canon: positive integer minor units). */
export function assertValidInvoiceAmount(amountMinor: number): void {
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
    throw new Error(
      `Invalid invoice amountMinor: ${amountMinor} (must be a positive integer in minor units)`
    )
  }
}

/**
 * Polymorphic order amount view (antigravity F6): legacy orders carry
 * `totalMinor`; Payload ecommerce orders carry `amount`. Both are interpreted
 * as the order total in minor units — provider adapters (004+) are responsible
 * for converting wire formats into minor units before calling this guard.
 */
export interface ProviderAmountOrderView {
  /** Legacy-style total in minor units. */
  totalMinor?: number | null
  /** Payload ecommerce-style total (interpreted as minor units, F6). */
  amount?: number | null
  currency?: string | null
  /** Explicit Stars price for the order, if fixed at creation time. */
  starsPrice?: number | null
}

export interface ProviderAmountInput {
  provider: string
  amountMinor: number
  currency: string
  order: ProviderAmountOrderView
}

export type AmountMatchVerdict =
  | { matches: true }
  | {
      matches: false
      reason: 'AMOUNT_MISMATCH' | 'CURRENCY_MISMATCH' | 'MISSING_ORDER_AMOUNT'
    }

/** Telegram Stars denominate in whole XTR units; the canonical Stars price of an
 * order is half of the fiat minor total (legacy checkout canon), minimum 1. */
export function expectedStarsPrice(order: ProviderAmountOrderView): number {
  if (typeof order.starsPrice === 'number' && order.starsPrice > 0) {
    return order.starsPrice
  }
  const totalMinor = order.totalMinor ?? order.amount
  return Math.max(1, Math.round((totalMinor ?? 0) / 2))
}

function resolveOrderTotalMinor(order: ProviderAmountOrderView): number | null {
  const totalMinor = order.totalMinor ?? order.amount
  return typeof totalMinor === 'number' && Number.isFinite(totalMinor) ? totalMinor : null
}

/**
 * Provider-aware amount/currency invariant (legacy `fulfillment.ts` semantics):
 * - TELEGRAM_STARS: `amountMinor === expectedStarsPrice(order) && currency === 'XTR'`
 * - fiat providers (STRIPE / CRYPTO_GATEWAY / …): `amountMinor === totalMinor &&
 *   currency.toUpperCase() === order.currency.toUpperCase()`
 *
 * Returns a verdict instead of throwing so webhook handlers can route mismatches
 * to the operator-resolution path without exception plumbing.
 */
export function assertProviderAmountMatch(input: ProviderAmountInput): AmountMatchVerdict {
  const { provider, amountMinor, currency, order } = input

  if (provider === 'TELEGRAM_STARS') {
    const expectedStars = expectedStarsPrice(order)
    if (currency.toUpperCase() !== 'XTR') {
      return { matches: false, reason: 'CURRENCY_MISMATCH' }
    }
    return amountMinor === expectedStars
      ? { matches: true }
      : { matches: false, reason: 'AMOUNT_MISMATCH' }
  }

  const totalMinor = resolveOrderTotalMinor(order)
  if (totalMinor === null) {
    return { matches: false, reason: 'MISSING_ORDER_AMOUNT' }
  }

  if (amountMinor !== totalMinor) {
    return { matches: false, reason: 'AMOUNT_MISMATCH' }
  }

  if (currency.toUpperCase() !== (order.currency ?? '').toUpperCase()) {
    return { matches: false, reason: 'CURRENCY_MISMATCH' }
  }

  return { matches: true }
}
