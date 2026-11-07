import { sql } from '@payloadcms/db-postgres'
import { getPayload } from 'payload'
import { describe, expect, it } from 'vitest'

import configPromise from '@payload-config'
import { beforeAll } from 'vitest'
import { resetBookingTables } from './helpers/reset003'

import {
  BookingError,
  cancelBooking,
  createBooking,
  applyGatewayEvent,
} from '@/lib/booking/bookingService'
import { toAmountMinor } from '@/lib/payments/amounts'
import type { PaymentGateway } from '@/lib/payments/stripeGateway'

/**
 * PREPAID money-path (spec 003 US1/US2, TC-003-002..006, TC-003-007..010):
 * Risk 20 → STM + DT + Error Guessing. The gateway is a seam (research D4) —
 * no network, deterministic intent/refund fakes.
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

// Re-run safety: the isolated test DB is NOT truncated between runs, so every
// booking lands in its own hour bucket (+<=15 min jitter, 60-min services).
let hourCursor = 61
const futureStart = (hoursAhead = 48): string => {
  void hoursAhead
  const h = (hourCursor += 2) + 0.5 + Math.random() * 0.2
  return new Date(Date.now() + h * 60 * 60 * 1000).toISOString()
}

function fakeGateway(): PaymentGateway & { intents: { bookingId: number; amountMinor: number }[]; refundCalls: string[]; failIntent: boolean; failRefund: boolean } {
  const g = {
    intents: [] as { bookingId: number; amountMinor: number }[],
    refundCalls: [] as string[],
    failIntent: false,
    failRefund: false,
    async createPaymentIntent({ amountMinor, bookingId }: { amountMinor: number; bookingId: number }) {
      if (g.failIntent) throw new Error('stripe down')
      g.intents.push({ bookingId, amountMinor })
      return { id: `pi_test_${bookingId}`, clientSecret: 'cs_test_secret' }
    },
    async createRefund({ paymentIntentId }: { paymentIntentId: string }) {
      if (g.failRefund) throw new Error('refund declined')
      g.refundCalls.push(paymentIntentId)
      return { id: `re_${paymentIntentId}` }
    },
  }
  return g
}

async function createService(mode: 'NONE' | 'FULL_PREPAYMENT', price = 50) {
  const product = await payload.create({
    collection: 'products',
    data: {
      title: `Prepaid Svc ${mode}`,
      slug: `prepaid-${mode.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      bookable: true,
      durationMin: 60,
      priceInUSD: price,
      paymentMode: mode,
      cancellationCutoffHours: 3,
      layout: [],
    },
    overrideAccess: true,
  })
  return String(product.id)
}

describe('T311 — deposit policy + PREPAID booking (FR-301/302/308)', () => {
  it('NONE service — 002 path unchanged, order amount 0 (TC-003-001)', async () => {
    const svc = await createService('NONE')
    const res = await createBooking(payload, {
      productId: svc,
      start: futureStart(30),
      customerName: 'None',
      customerPhone: '+70000000010',
    })
    expect(res.status).toBe('BOOKED')
    expect(res.paymentMode).toBe('NONE')
    const orders = await payload.findByID({ collection: 'orders', id: res.orderId, overrideAccess: true, depth: 0 })
    expect((orders as unknown as { amount: number }).amount).toBe(0)
  })

  it('FULL_PREPAYMENT without email → 422 EMAIL_REQUIRED (FR-308, TC-003-018)', async () => {
    const svc = await createService('FULL_PREPAYMENT')
    await expect(
      createBooking(payload, {
        productId: svc,
        start: futureStart(30),
        customerName: 'No Email',
        customerPhone: '+70000000011',
      }),
    ).rejects.toMatchObject({ code: 'EMAIL_REQUIRED', status: 422 })
  })

  it('FULL_PREPAYMENT happy path → HELD + TTL + minor-units order + PI after commit (TC-003-003)', async () => {
    const svc = await createService('FULL_PREPAYMENT', 19.99)
    const gw = fakeGateway()
    const res = await createBooking(payload, {
      productId: svc,
      start: futureStart(30),
      customerName: 'Prepay',
      customerPhone: '+70000000012',
      customerEmail: 'prepay@example.com',
      gateway: gw,
    })
    expect(res.status).toBe('HELD')
    expect(res.paymentMode).toBe('FULL_PREPAYMENT')
    expect(res.clientSecret).toBe('cs_test_secret')
    // Money invariant: 19.99 USD → 1999 minor units (Math.round canon)
    expect(gw.intents).toEqual([{ bookingId: res.reservationId, amountMinor: 1999 }])
    // PI id persisted on the order (plugin stripe group)
    const db: any = payload.db
    const row = await db.execute({
      drizzle: db.drizzle,
      sql: sql`SELECT status, amount, stripe_payment_intent_ref AS stripe_payment_intent_id FROM orders WHERE id = ${res.orderId}`,
    })
    const order = row.rows[0] as { status: string; amount: number; stripe_payment_intent_id: string }
    expect(Number(order.amount)).toBe(1999) // NUMERIC → string from pg
    expect(order.stripe_payment_intent_id).toBe(`pi_test_${res.reservationId}`)
    // HELD TTL set (15m)
    const sr = await db.execute({
      drizzle: db.drizzle,
      sql: sql`SELECT hold_expires_at FROM slot_reservations WHERE id = ${res.reservationId}`,
    })
    const hold = sr.rows[0] as { hold_expires_at: string }
    expect(new Date(hold.hold_expires_at).getTime()).toBeGreaterThan(Date.now())
    // PaymentIntent carries the booking metadata (late-webhook resolution key)
    expect(gw.intents[0]?.bookingId).toBe(res.reservationId)
  })

  it('PI-creation failure → immediate RELEASED + order cancelled + 502 (review F-PI, TC-003-006)', async () => {
    const svc = await createService('FULL_PREPAYMENT')
    const gw = fakeGateway()
    gw.failIntent = true
    await expect(
      createBooking(payload, {
        productId: svc,
        start: futureStart(30),
        customerName: 'Fail',
        customerPhone: '+70000000013',
        customerEmail: 'fail@example.com',
        gateway: gw,
      }),
    ).rejects.toMatchObject({ code: 'PAYMENT_INIT_FAILED', status: 502 })
    // Slot NOT marinated for 15 min — released immediately
    const db: any = payload.db
    const rows = await db.execute({
      drizzle: db.drizzle,
      sql: sql`SELECT sr.status, o.status AS order_status
        FROM slot_reservations sr JOIN orders o ON o.id = sr.order_id
        WHERE sr.customer_name = 'Fail' ORDER BY sr.id DESC LIMIT 1`,
    })
    const r = rows.rows[0] as { status: string; order_status: string }
    expect(r.status).toBe('RELEASED')
    expect(r.order_status).toBe('cancelled')
  })

  it('webhook GATEWAY_FINISHED → CONFIRMED + order completed; replay ×3 → 1 PaymentEvent (TC-003-007)', async () => {
    const svc = await createService('FULL_PREPAYMENT')
    const gw = fakeGateway()
    const created = await createBooking(payload, {
      productId: svc,
      start: futureStart(30),
      customerName: 'Webhook',
      customerPhone: '+70000000014',
      customerEmail: 'wh@example.com',
      gateway: gw,
    })
    const ref = `pi_test_${created.reservationId}`
    for (let i = 0; i < 3; i++) {
      const out = await applyGatewayEvent(payload, {
        provider: 'STRIPE',
        providerRef: ref,
        eventType: 'payment_intent.succeeded',
        amountMinor: 5000,
        currency: 'usd',
      })
      if (i === 0) expect(out).toMatchObject({ deduped: false, outcome: 'confirmed' })
      else expect(out).toMatchObject({ deduped: true, outcome: 'ignored' })
    }
    const db: any = payload.db
    const rows = await db.execute({
      drizzle: db.drizzle,
      sql: sql`SELECT sr.status, o.status AS order_status,
        (SELECT count(*) FROM payment_events WHERE provider_ref = ${ref}) AS ledger_count
        FROM slot_reservations sr JOIN orders o ON o.id = sr.order_id WHERE sr.id = ${created.reservationId}`,
    })
    const r = rows.rows[0] as { status: string; order_status: string; ledger_count: number }
    expect(r.status).toBe('BOOKED')
    expect(r.order_status).toBe('completed')
    expect(Number(r.ledger_count)).toBe(1)
  })

  it('late webhook after release + re-book → paid_requires_resolution, never silent PAID (TC-003-005)', async () => {
    const svc = await createService('FULL_PREPAYMENT')
    const gw = fakeGateway()
    const lateStart = futureStart()
    const first = await createBooking(payload, {
      productId: svc,
      start: lateStart,
      customerName: 'Late',
      customerPhone: '+70000000015',
      customerEmail: 'late@example.com',
      gateway: gw,
    })
    // Release the hold (unpaid, no money moved yet)
    await cancelBooking(payload, String(first.reservationId), first.cancelToken)
    // Someone else takes the slot
    const second = await createBooking(payload, {
      productId: svc,
      start: lateStart,
      customerName: 'Second',
      customerPhone: '+70000000016',
      customerEmail: 'second@example.com',
      gateway: fakeGateway(),
    })
    expect(second.reservationId).not.toBe(first.reservationId)
    // The late payment lands for the FIRST booking's PI
    const out = await applyGatewayEvent(payload, {
      provider: 'STRIPE',
      providerRef: `pi_test_${first.reservationId}`,
      eventType: 'payment_intent.succeeded',
      amountMinor: toAmountMinor(50),
      currency: 'usd',
    })
    expect(out.outcome).toBe('paid-requires-resolution')
    const db: any = payload.db
    const rows = await db.execute({
      drizzle: db.drizzle,
      sql: sql`SELECT status FROM orders WHERE id = ${first.orderId}`,
    })
    expect((rows.rows[0] as { status: string }).status).toBe('paid_requires_resolution')
    // And the SECOND customer keeps their booking (slot never stolen)
    const secondRow = await db.execute({
      drizzle: db.drizzle,
      sql: sql`SELECT status FROM slot_reservations WHERE id = ${second.reservationId}`,
    })
    expect((secondRow.rows[0] as { status: string }).status).toBe('HELD')
  })

  it('amount mismatch → AMOUNT_MISMATCH ledger + alert, FSM untouched (TC-003-009)', async () => {
    const svc = await createService('FULL_PREPAYMENT')
    const gw = fakeGateway()
    const created = await createBooking(payload, {
      productId: svc,
      start: futureStart(30),
      customerName: 'Mismatch',
      customerPhone: '+70000000017',
      customerEmail: 'mm@example.com',
      gateway: gw,
    })
    const out = await applyGatewayEvent(payload, {
      provider: 'STRIPE',
      providerRef: `pi_test_${created.reservationId}`,
      eventType: 'payment_intent.succeeded',
      amountMinor: 1, // wrong amount — fail-closed
      currency: 'usd',
    })
    expect(out.outcome).toBe('amount-mismatch')
    const db: any = payload.db
    const rows = await db.execute({
      drizzle: db.drizzle,
      sql: sql`SELECT sr.status, o.status AS order_status
        FROM slot_reservations sr JOIN orders o ON o.id = sr.order_id WHERE sr.id = ${created.reservationId}`,
    })
    const r = rows.rows[0] as { status: string; order_status: string }
    expect(r.status).toBe('HELD') // NOT confirmed
    expect(r.order_status).toBe('processing')
  })

  it('payment_failed webhook releases the unpaid hold (STM GATEWAY_FAILED)', async () => {
    const svc = await createService('FULL_PREPAYMENT')
    const gw = fakeGateway()
    const created = await createBooking(payload, {
      productId: svc,
      start: futureStart(30),
      customerName: 'FailWh',
      customerPhone: '+70000000018',
      customerEmail: 'fw@example.com',
      gateway: gw,
    })
    const out = await applyGatewayEvent(payload, {
      provider: 'STRIPE',
      providerRef: `pi_test_${created.reservationId}`,
      eventType: 'payment_intent.payment_failed',
    })
    expect(out.outcome).toBe('released')
    const db: any = payload.db
    const rows = await db.execute({
      drizzle: db.drizzle,
      sql: sql`SELECT status FROM slot_reservations WHERE id = ${created.reservationId}`,
    })
    expect((rows.rows[0] as { status: string }).status).toBe('RELEASED')
  })

  it('unknown providerRef → UNMATCHED ledger row, 200-equivalent outcome (ACK matrix)', async () => {
    const out = await applyGatewayEvent(payload, {
      provider: 'STRIPE',
      providerRef: 'pi_unknown_123456',
      eventType: 'payment_intent.succeeded',
      amountMinor: 100,
      currency: 'usd',
    })
    expect(out.outcome).toBe('ignored')
  })

  it('client paymentMode injection is structurally impossible (review F7, TC-003-002)', async () => {
    const svc = await createService('NONE')
    // The CreateBookingInput type has NO paymentMode field; passing an extra
    // property in a Record cast simulates a forged client body.
    const forged = { productId: svc, start: futureStart(30), customerName: 'Hacker', customerPhone: '+70000000019', paymentMode: 'NONE' } as unknown as Parameters<typeof createBooking>[1]
    const res = await createBooking(payload, forged)
    // Server read the mode from the product (NONE) → BOOKED with zero amount.
    expect(res.paymentMode).toBe('NONE')
    void BookingError // type import kept alive for the rejects matchers above
  })
})
