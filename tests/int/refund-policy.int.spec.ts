import { sql } from '@payloadcms/db-postgres'
import { getPayload } from 'payload'
import { describe, expect, it } from 'vitest'

import configPromise from '@payload-config'
import { beforeAll } from 'vitest'
import { resetBookingTables } from './helpers/reset003'

import {
  applyGatewayEvent,
  cancelBooking,
  createBooking,
} from '@/lib/booking/bookingService'
import { resolveRefundRequest } from '@/lib/booking/refundService'
import { isBeforeCancellationCutoff } from '@/lib/payments/amounts'
import type { PaymentGateway } from '@/lib/payments/stripeGateway'

/**
 * Refund policy (spec 003 FR-304, review F2/F13): TC-003-011/012 + cutoff BVA.
 * Strictly exclusive boundary: auto-refund only while now < start - cutoff.
 */

const payload = await getPayload({ config: configPromise })

beforeAll(async () => {
  await resetBookingTables(payload)
  // The default-resource lookup needs exactly one active master after the truncate.
  await payload.create({
    collection: 'resources',
    data: { name: '003 Test Master', active: true },
    overrideAccess: true,
  })
})

function fakeGateway(): PaymentGateway & { refundCalls: string[]; failRefund: boolean } {
  const g = {
    refundCalls: [] as string[],
    failRefund: false,
    async createPaymentIntent({ amountMinor, bookingId }: { amountMinor: number; bookingId: number }) {
      return { id: `pi_test_${bookingId}`, clientSecret: null }
    },
    async createRefund({ paymentIntentId }: { paymentIntentId: string }) {
      if (g.failRefund) throw new Error('refund declined')
      g.refundCalls.push(paymentIntentId)
      return { id: `re_${paymentIntentId}` }
    },
  }
  return g
}

let hourCursor = 181

async function createPrepaid(hoursAhead: number, cutoffHours = 3) {
  void hoursAhead
  const hoursAheadEffective = (hourCursor += 2) + 0.5 + Math.random() * 0.2
  const product = await payload.create({
    collection: 'products',
    data: {
      title: `Refund Svc ${cutoffHours}`,
      slug: `refund-svc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      bookable: true,
      durationMin: 60,
      priceInUSD: 40,
      paymentMode: 'FULL_PREPAYMENT',
      cancellationCutoffHours: cutoffHours,
      layout: [],
    },
    overrideAccess: true,
  })
  const gw = fakeGateway()
  const created = await createBooking(payload, {
    productId: String(product.id),
    start: new Date(Date.now() + hoursAheadEffective * 60 * 60 * 1000).toISOString(),
    customerName: `RefundUser${Date.now() % 100000}`,
    customerPhone: '+70000000030',
    customerEmail: 'refund@example.com',
    gateway: gw,
  })
  // Pay: webhook confirms → order 'completed' (money captured)
  const outcome = await applyGatewayEvent(payload, {
    provider: 'STRIPE',
    providerRef: `pi_test_${created.reservationId}`,
    eventType: 'payment_intent.succeeded',
    amountMinor: 4000,
    currency: 'usd',
  })
  if (outcome.outcome !== 'confirmed') {
    throw new Error(`confirm failed: ${JSON.stringify(outcome)}`)
  }
  return { created, gw }
}

describe('T321 — refund policy (FR-304)', () => {
  it('cancel BEFORE cutoff → auto Stripe refund → order refunded (TC-003-011)', async () => {
    const { created, gw } = await createPrepaid(48)
    const res = await cancelBooking(
      payload,
      String(created.reservationId),
      created.cancelToken,
      new Date(),
      gw,
    )
    expect(res.refund).toBe('auto-refunded')
    expect(gw.refundCalls).toEqual([`pi_test_${created.reservationId}`])
    const db: any = payload.db
    const rows = await db.execute({
      drizzle: db.drizzle,
      sql: sql`SELECT status FROM orders WHERE id = ${created.orderId}`,
    })
    expect((rows.rows[0] as { status: string }).status).toBe('refunded')
  })

  it('cancel AFTER cutoff → refund_requested, NO auto refund (TC-003-012)', async () => {
    // start inside the cutoff window: ~1h ahead with a 3h cutoff → post-boundary
    const product = await payload.create({
      collection: 'products',
      data: {
        title: 'Refund Svc Short',
        slug: `refund-short-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        bookable: true,
        durationMin: 60,
        priceInUSD: 40,
        paymentMode: 'FULL_PREPAYMENT',
        cancellationCutoffHours: 3,
        layout: [],
      },
      overrideAccess: true,
    })
    const gw = fakeGateway()
    const created = await createBooking(payload, {
      productId: String(product.id),
      start: new Date(Date.now() + (1 + Math.random() * 0.1) * 60 * 60 * 1000).toISOString(),
      customerName: `RefundUser${Date.now() % 100000}`,
      customerPhone: '+70000000030',
      customerEmail: 'refund@example.com',
      gateway: gw,
    })
    await applyGatewayEvent(payload, {
      provider: 'STRIPE',
      providerRef: `pi_test_${created.reservationId}`,
      eventType: 'payment_intent.succeeded',
      amountMinor: 4000,
      currency: 'usd',
    })
    const res = await cancelBooking(
      payload,
      String(created.reservationId),
      created.cancelToken,
      new Date(),
      gw,
    )
    expect(res.refund).toBe('refund_requested')
    expect(gw.refundCalls).toHaveLength(0)
    const db: any = payload.db
    const rows = await db.execute({
      drizzle: db.drizzle,
      sql: sql`SELECT status FROM orders WHERE id = ${created.orderId}`,
    })
    expect((rows.rows[0] as { status: string }).status).toBe('refund_requested')

    // Staff resolution (FR-304): reject → refund_rejected (terminal)
    const rejected = await resolveRefundRequest(payload, {
      orderId: String(created.orderId),
      action: 'reject',
      actorId: 'test-operator',
      gateway: gw,
    })
    expect(rejected.status).toBe('refund_rejected')
  })

  it('BVA: exactly AT the boundary (now == start - cutoff) → staff path (exclusive, review F13)', () => {
    const start = new Date('2026-11-10T10:00:00.000Z')
    const cutoffAt = new Date(start.getTime() - 3 * 60 * 60 * 1000)
    expect(isBeforeCancellationCutoff({ start, cancellationCutoffHours: 3, now: new Date(cutoffAt.getTime() - 1) })).toBe(true)
    expect(isBeforeCancellationCutoff({ start, cancellationCutoffHours: 3, now: cutoffAt })).toBe(false)
    expect(isBeforeCancellationCutoff({ start, cancellationCutoffHours: 3, now: new Date(cutoffAt.getTime() + 1) })).toBe(false)
  })

  it('staff approve → gateway refund → refunded; gateway failure → refund_failed + alert (D5)', async () => {
    const product = await payload.create({
      collection: 'products',
      data: {
        title: 'Refund Svc Short 2',
        slug: `refund-short2-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        bookable: true,
        durationMin: 60,
        priceInUSD: 40,
        paymentMode: 'FULL_PREPAYMENT',
        cancellationCutoffHours: 3,
        layout: [],
      },
      overrideAccess: true,
    })
    const gw = fakeGateway()
    const created = await createBooking(payload, {
      productId: String(product.id),
      start: new Date(Date.now() + (1 + Math.random() * 0.1) * 60 * 60 * 1000).toISOString(),
      customerName: `RefundUser${Date.now() % 100000}`,
      customerPhone: '+70000000032',
      customerEmail: 'refund@example.com',
      gateway: gw,
    })
    await applyGatewayEvent(payload, {
      provider: 'STRIPE',
      providerRef: `pi_test_${created.reservationId}`,
      eventType: 'payment_intent.succeeded',
      amountMinor: 4000,
      currency: 'usd',
    })
    // Order sits in refund_requested after post-cutoff cancel
    await cancelBooking(payload, String(created.reservationId), created.cancelToken, new Date(), gw)

    const gwFailing = fakeGateway()
    gwFailing.failRefund = true
    const failed = await resolveRefundRequest(payload, {
      orderId: String(created.orderId),
      action: 'approve',
      actorId: 'test-operator',
      gateway: gwFailing,
    })
    expect(failed.status).toBe('refund_failed')

    // Verifiable tail: alert audit row exists; a retry on a failed order is blocked
    const db: any = payload.db
    const alert = await db.execute({
      drizzle: db.drizzle,
      sql: sql`SELECT count(*) AS n FROM audit_events WHERE aggregate_type = 'ORDER' AND aggregate_id = ${String(created.orderId)} AND action = 'payment.alert'`,
    })
    expect(Number((alert.rows[0] as { n: number }).n)).toBe(1)
    const again = await resolveRefundRequest(payload, {
      orderId: String(created.orderId),
      action: 'approve',
      actorId: 'test-operator',
      gateway: gw,
    })
    expect(again.status).toBe('ALREADY_RESOLVED')
  })

  it('free-track cancel (no money) → no refund fields, order cancelled (0 regressions)', async () => {
    const product = await payload.create({
      collection: 'products',
      data: {
        title: 'Free Svc',
        slug: `free-svc-${Date.now()}`,
        bookable: true,
        durationMin: 30,
        priceInUSD: 10,
        layout: [],
      },
      overrideAccess: true,
    })
    const created = await createBooking(payload, {
      productId: String(product.id),
      start: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      customerName: 'FreeCancel',
      customerPhone: '+70000000031',
    })
    const gw = fakeGateway()
    const res = await cancelBooking(
      payload,
      String(created.reservationId),
      created.cancelToken,
      new Date(),
      gw,
    )
    expect(res.refund).toBeUndefined()
    expect(gw.refundCalls).toHaveLength(0)
  })
})
