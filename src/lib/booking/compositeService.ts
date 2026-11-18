import type { PaymentMode } from '@/lib/booking/bookingService'

/**
 * Minor-unit rounding for DERIVED basket totals. NOT `toAmountMinor` — that
 * canon guard throws on non-positive values (it protects chargeable amounts),
 * while a NONE basket legitimately derives Σ deposit = 0 and a free add-on
 * derives Σ price contributions of 0 (caught live by T1440).
 */
function toMinor(amount: number): number {
  return Math.round((Number.isFinite(amount) ? amount : 0) * 100)
}

/**
 * Composite basket derivation (spec 014 FR-1402/1404, T1401/T1410): PURE —
 * no I/O, no clock. Products are fetched by the caller and passed in; this
 * module only derives and validates. The FSM, availability kernel and money
 * invariants stay untouched (Option 0: one slot container, one Order).
 */

export const MAX_ITEMS = 6
export const MAX_COMPOSITE_MIN = 480

export interface CompositeProductRow {
  id: string
  title: string
  durationMin: number
  priceInUSD: number
  depositAmount: number
  addOn: boolean
  paymentMode: string
  bufferBeforeMin: number
  bufferAfterMin: number
  outCallEnabled: boolean
}

export interface CompositeSnapshotItem {
  productId: string
  title: string
  durationMin: number
  priceInUSD: number
  depositAmount: number
  addOn: boolean
}

export interface DerivedComposite {
  itemIds: string[]
  primaryItemId: string
  totalDurationMin: number
  bufferBeforeMin: number
  bufferAfterMin: number
  paymentMode: PaymentMode
  /**
   * Full basket cost (AG-F2) — a DERIVED value for surfaces/responses.
   * NEVER written to `orders.amount` (that stays the 003/012 chargeable canon).
   */
  totalPriceMinor: number
  /**
   * The amount actually charged through the gateway (003/012 canon:
   * 0 for NONE, Σ depositAmount for DEPOSIT, Σ priceInUSD for
   * FULL_PREPAYMENT) — compatible with `assertProviderAmountMatch` and
   * `charge.refunded` (fix AG-F2).
   */
  chargeableAmountMinor: number
  totalDepositMinor: number
  items: CompositeSnapshotItem[]
  outCall: boolean
}

export type CompositeErrorCode =
  | 'COMPOSITE_INVALID'
  | 'ADDON_ONLY_BASKET'
  | 'COMPOSITE_TOO_LONG'
  | 'MIXED_PAYMENT_MODES'
  | 'INVALID_DEPOSIT_AMOUNT'

export type DeriveCompositeResult =
  | { ok: true; composite: DerivedComposite }
  | { ok: false; code: CompositeErrorCode; message: string }

/**
 * A free add-on (addOn && price 0 && deposit 0) is paymentMode-NEUTRAL: it
 * inherits the basket mode and never triggers MIXED_PAYMENT_MODES (fix AG-F4.1).
 */
export function isNeutralFreeAddOn(p: Pick<CompositeProductRow, 'addOn' | 'priceInUSD' | 'depositAmount'>): boolean {
  return p.addOn === true && (p.priceInUSD ?? 0) === 0 && (p.depositAmount ?? 0) === 0
}

/** Deterministic idempotency seed: sorted ids WITH duplicates preserved (["A","A"] ≠ ["A"]). */
export function compositeIdempotencySeed(itemIds: string[]): string {
  return [...itemIds].sort().join(',')
}

export function deriveComposite(
  itemIds: string[],
  products: CompositeProductRow[],
): DeriveCompositeResult {
  if (!Array.isArray(itemIds) || itemIds.length === 0 || itemIds.some((id) => typeof id !== 'string' || id.length === 0)) {
    return { ok: false, code: 'COMPOSITE_INVALID', message: 'items must be a non-empty array of product ids' }
  }
  if (itemIds.length > MAX_ITEMS) {
    return { ok: false, code: 'COMPOSITE_TOO_LONG', message: `Basket is limited to ${MAX_ITEMS} positions` }
  }

  const byId = new Map(products.map((p) => [String(p.id), p]))
  const resolved: CompositeProductRow[] = []
  for (const id of itemIds) {
    const p = byId.get(String(id))
    if (!p || p.durationMin == null) {
      return { ok: false, code: 'COMPOSITE_INVALID', message: `Position ${id} does not exist or is not bookable` }
    }
    resolved.push(p)
  }

  // Primary = first non-addOn position (composition predicate, fix AG-F5).
  const primaryIndex = resolved.findIndex((p) => p.addOn !== true)
  if (primaryIndex === -1) {
    return { ok: false, code: 'ADDON_ONLY_BASKET', message: 'A basket needs at least one non-add-on service' }
  }

  const totalDurationMin = resolved.reduce((sum, p) => sum + (p.durationMin ?? 0), 0)
  if (totalDurationMin < 5) {
    return { ok: false, code: 'ADDON_ONLY_BASKET', message: 'Composite duration must be at least 5 minutes' }
  }
  if (totalDurationMin > MAX_COMPOSITE_MIN) {
    return { ok: false, code: 'COMPOSITE_TOO_LONG', message: `Composite duration must be at most ${MAX_COMPOSITE_MIN} minutes` }
  }

  // Uniform paymentMode across NON-neutral positions; neutral add-ons inherit.
  const nonNeutral = resolved.filter((p) => !isNeutralFreeAddOn(p))
  const modes = [...new Set(nonNeutral.map((p) => p.paymentMode))]
  if (modes.length > 1) {
    return { ok: false, code: 'MIXED_PAYMENT_MODES', message: 'All paid positions must share one payment mode' }
  }
  const rawMode = modes[0] ?? 'NONE'
  const paymentMode: PaymentMode =
    rawMode === 'FULL_PREPAYMENT' ? 'FULL_PREPAYMENT' : rawMode === 'DEPOSIT' ? 'DEPOSIT' : 'NONE'

  const totalPriceMinor = toMinor(resolved.reduce((sum, p) => sum + (p.priceInUSD ?? 0), 0))
  const totalDepositMinor = toMinor(resolved.reduce((sum, p) => sum + (p.depositAmount ?? 0), 0))
  const chargeableAmountMinor =
    paymentMode === 'FULL_PREPAYMENT'
      ? totalPriceMinor
      : paymentMode === 'DEPOSIT'
        ? totalDepositMinor
        : 0

  // Zero-guard (fix AG-F4.3): a paid gateway intent with amountMinor 0 would 502.
  if (paymentMode === 'DEPOSIT') {
    if (totalDepositMinor <= 0) {
      return { ok: false, code: 'INVALID_DEPOSIT_AMOUNT', message: 'DEPOSIT basket requires a positive total deposit' }
    }
    if (totalDepositMinor > totalPriceMinor) {
      return { ok: false, code: 'INVALID_DEPOSIT_AMOUNT', message: 'Total deposit cannot exceed the basket price' }
    }
  }
  if (paymentMode === 'FULL_PREPAYMENT' && totalPriceMinor <= 0) {
    return { ok: false, code: 'INVALID_DEPOSIT_AMOUNT', message: 'FULL_PREPAYMENT basket requires a positive total price' }
  }

  // Snapshot in primary-first order, then items[] order (Clarifications #3).
  const snapshot: CompositeSnapshotItem[] = resolved.map((p) => ({
    productId: String(p.id),
    title: p.title,
    durationMin: p.durationMin,
    priceInUSD: p.priceInUSD ?? 0,
    depositAmount: p.depositAmount ?? 0,
    addOn: p.addOn === true,
  }))
  const primary = snapshot.splice(primaryIndex, 1)[0]
  snapshot.unshift(primary)

  return {
    ok: true,
    composite: {
      itemIds: [...itemIds],
      primaryItemId: String(resolved[primaryIndex].id),
      totalDurationMin,
      bufferBeforeMin: Math.max(0, ...resolved.map((p) => p.bufferBeforeMin ?? 0)),
      bufferAfterMin: Math.max(0, ...resolved.map((p) => p.bufferAfterMin ?? 0)),
      paymentMode,
      totalPriceMinor,
      chargeableAmountMinor,
      totalDepositMinor,
      items: snapshot,
      outCall: resolved.some((p) => p.outCallEnabled === true),
    },
  }
}
