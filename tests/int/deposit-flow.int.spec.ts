import { sql } from '@payloadcms/db-postgres'
import { getPayload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import configPromise from '@payload-config'
import { resetBookingTables } from './helpers/reset003'
import {
  BookingError,
  cancelBooking,
  createBooking,
  applyGatewayEvent,
} from '@/lib/booking/bookingService'
import { resolveRefundRequest } from '@/lib/booking/refundService'
import type { PaymentGateway } from '@/lib/payments/stripeGateway'

/**
 * Spec 012-deposit-telegram: Deposit flow integration tests.
 * Validates 'deposit to hold' paymentMode (FR-1201..1205):
 * - createBooking with DEPOSIT charges only depositAmount (not full service price)
 * - FSM moves to HELD (15m hold)
 * - Gateway payment_intent.succeeded confirms the deposit and books the slot
 * - Pre-cutoff cancellation auto-refunds the deposit
 * - Post-cutoff cancellation lands in refund_requested and staff-approve refunds the deposit
 */

const payload = await getPayload({ config: configPromise })

let hourCursor = 40
const futureStart = (hoursAhead = 48): string => {
  void hoursAhead
  hourCursor += 6
  return new Date(Date.now() + hourCursor * 60 * 60 * 1000).toISOString()
}

let globalSeq = 1

function createMockGateway(): {
  gateway: PaymentGateway
  intents: Array<{ amountMinor: number; currency: string; bookingId: number }>
  refunds: Array<{ paymentIntentId: string; idempotencyKey?: string }>
} {
  const intents: Array<{ amountMinor: number; currency: string; bookingId: number }> = []
  const refunds: Array<{ paymentIntentId: string; idempotencyKey?: string }> = []

  const gateway: PaymentGateway = {
    async createPaymentIntent({ amountMinor, currency, bookingId }) {
      intents.push({ amountMinor, currency, bookingId })
      const id = `pi_mock_deposit_${globalSeq++}`
      return { id, clientSecret: `${id}_secret` }
    },
    async createRefund({ paymentIntentId, idempotencyKey }) {
      refunds.push({ paymentIntentId, idempotencyKey })
      return { id: `re_mock_deposit_${globalSeq++}` }
    },
  }
  return { gateway, intents, refunds }
}

let resourceId = '1'

beforeAll(async () => {
  await resetBookingTables(payload)

  const resource = await payload.create({
    collection: 'resources',
    data: { name: 'Deposit Master', active: true },
    overrideAccess: true,
  })
  resourceId = String(resource.id)
})

describe('Spec 012 — Deposit to Hold Flow', () => {
  it('charges only depositAmount in PaymentIntent and holds the slot in HELD status', async () => {
    const { gateway, intents } = createMockGateway()

    // 1. Service with $100 price, but only $25 deposit to hold
    const product = await payload.create({
      collection: 'products',
      data: {
        title: 'Premium Styling',
        slug: `deposit-svc-${Date.now()}`,
        bookable: true,
        durationMin: 60,
        priceInUSD: 100,
        paymentMode: 'DEPOSIT',
        depositAmount: 25,
        layout: [],
      },
      overrideAccess: true,
    })

    const start = futureStart(48)
    const booking = await createBooking(payload, {
      productId: String(product.id),
      resourceId,
      start,
      customerName: 'Alice Deposit',
      customerPhone: '+79991234567',
      customerEmail: 'alice@example.com',
      gateway,
    })

    // Assertions:
    expect(booking.paymentMode).toBe('DEPOSIT')
    expect(booking.status).toBe('HELD')
    expect(booking.paymentIntentId).toMatch(/^pi_mock_deposit_/)
    expect(booking.clientSecret).toMatch(/_secret$/)

    // Verify PaymentIntent was created with $25 (2500 cents), NOT $100 (10000 cents)!
    expect(intents.length).toBe(1)
    expect(intents[0].amountMinor).toBe(2500)
    expect(intents[0].currency).toBe('USD')

    // Verify orders table stores amount = 2500
    const db: any = payload.db
    const orderRes = await db.execute({
      drizzle: db.drizzle,
      sql: sql`SELECT amount, status, stripe_payment_intent_ref FROM orders WHERE id = ${booking.orderId}`,
    })
    const orderRow = orderRes.rows[0] as { amount: string; status: string; stripe_payment_intent_ref: string }
    expect(Number(orderRow.amount)).toBe(2500)
    expect(orderRow.status).toBe('processing')
    expect(orderRow.stripe_payment_intent_ref).toBe(booking.paymentIntentId)
  })

  it('rejects deposit booking without customer email or invalid deposit amount', async () => {
    const product = await payload.create({
      collection: 'products',
      data: {
        title: 'Validation Svc',
        slug: `val-svc-${Date.now()}`,
        bookable: true,
        durationMin: 60,
        priceInUSD: 80,
        paymentMode: 'DEPOSIT',
        depositAmount: 20,
        layout: [],
      },
      overrideAccess: true,
    })

    // Missing email -> 422 EMAIL_REQUIRED
    await expect(
      createBooking(payload, {
        productId: String(product.id),
        resourceId,
        start: futureStart(50),
        customerName: 'No Email',
        customerPhone: '+79990001111',
      }),
    ).rejects.toMatchObject({ code: 'EMAIL_REQUIRED', status: 422 })

    // Product with deposit > priceInUSD is rejected by field validator (FR-1201)
    await expect(
      payload.create({
        collection: 'products',
        data: {
          title: 'Excessive Deposit',
          slug: `exc-svc-${Date.now()}`,
          bookable: true,
          durationMin: 60,
          priceInUSD: 50,
          paymentMode: 'DEPOSIT',
          depositAmount: 60, // 60 > 50!
          layout: [],
        },
        overrideAccess: true,
      }),
    ).rejects.toThrow()
  })

  it('webhook payment_intent.succeeded confirms the deposit and commits the reservation to BOOKED', async () => {
    const { gateway } = createMockGateway()

    const product = await payload.create({
      collection: 'products',
      data: {
        title: 'Massage',
        slug: `msg-svc-${Date.now()}`,
        bookable: true,
        durationMin: 60,
        priceInUSD: 70,
        paymentMode: 'DEPOSIT',
        depositAmount: 20,
        layout: [],
      },
      overrideAccess: true,
    })

    const booking = await createBooking(payload, {
      productId: String(product.id),
      resourceId,
      start: futureStart(54),
      customerName: 'Bob Confirmed',
      customerPhone: '+79993334444',
      customerEmail: 'bob@example.com',
      gateway,
    })

    expect(booking.status).toBe('HELD')

    // Webhook delivers payment_intent.succeeded with the $20 deposit (2000 minor)
    const applyResult = await applyGatewayEvent(payload, {
      provider: 'STRIPE',
      providerRef: booking.paymentIntentId as string,
      eventType: 'payment_intent.succeeded',
      amountMinor: 2000,
      currency: 'USD',
    })

    expect(applyResult.outcome).toBe('confirmed')

    // Verify DB states: reservation is BOOKED, order is completed
    const db: any = payload.db
    const resRow = (await db.execute({
      drizzle: db.drizzle,
      sql: sql`SELECT status FROM slot_reservations WHERE id = ${booking.reservationId}`,
    })).rows[0] as { status: string }
    expect(resRow.status).toBe('BOOKED')

    const orderRow = (await db.execute({
      drizzle: db.drizzle,
      sql: sql`SELECT status FROM orders WHERE id = ${booking.orderId}`,
    })).rows[0] as { status: string }
    expect(orderRow.status).toBe('completed')
  })

  it('cancellation before cutoff auto-refunds the deposit via gateway', async () => {
    const { gateway, refunds } = createMockGateway()

    const product = await payload.create({
      collection: 'products',
      data: {
        title: 'Dental Checkup',
        slug: `dental-svc-${Date.now()}`,
        bookable: true,
        durationMin: 60,
        priceInUSD: 120,
        paymentMode: 'DEPOSIT',
        depositAmount: 30,
        cancellationCutoffHours: 4,
        layout: [],
      },
      overrideAccess: true,
    })

    const booking = await createBooking(payload, {
      productId: String(product.id),
      resourceId,
      start: futureStart(48), // 48h > 4h cutoff
      customerName: 'Charlie Cancel',
      customerPhone: '+79995556666',
      customerEmail: 'charlie@example.com',
      gateway,
    })

    // Settle payment
    const applyResult = await applyGatewayEvent(payload, {
      provider: 'STRIPE',
      providerRef: booking.paymentIntentId as string,
      eventType: 'payment_intent.succeeded',
      amountMinor: 3000,
      currency: 'USD',
    })

    // Cancel before cutoff
    const cancelRes = await cancelBooking(
      payload,
      String(booking.reservationId),
      booking.cancelToken,
      new Date(),
      gateway,
    )

    expect(cancelRes.status).toBe('cancelled')
    expect(cancelRes.refund).toBe('auto-refunded')

    // Verify refund call was made for this deposit PaymentIntent
    expect(refunds.length).toBe(1)
    expect(refunds[0].paymentIntentId).toBe(booking.paymentIntentId)
    expect(refunds[0].idempotencyKey).toBe(`cancel-${booking.orderId}`)
  })

  it('post-cutoff cancellation lands in refund_requested and staff resolveRefundRequest executes refund', async () => {
    const { gateway, refunds } = createMockGateway()

    const product = await payload.create({
      collection: 'products',
      data: {
        title: 'Late Cancel Svc',
        slug: `late-svc-${Date.now()}`,
        bookable: true,
        durationMin: 60,
        priceInUSD: 150,
        paymentMode: 'DEPOSIT',
        depositAmount: 50,
        cancellationCutoffHours: 24,
        layout: [],
      },
      overrideAccess: true,
    })

    // Start is 10 hours from now (< 24h cutoff!)
    const nearStart = new Date(Date.now() + 10 * 3600 * 1000).toISOString()
    const booking = await createBooking(payload, {
      productId: String(product.id),
      resourceId,
      start: nearStart,
      customerName: 'David Late',
      customerPhone: '+79997778888',
      customerEmail: 'david@example.com',
      gateway,
    })

    await applyGatewayEvent(payload, {
      provider: 'STRIPE',
      providerRef: booking.paymentIntentId as string,
      eventType: 'payment_intent.succeeded',
      amountMinor: 5000,
      currency: 'USD',
    })

    // Cancel past cutoff -> lands in refund_requested
    const cancelRes = await cancelBooking(
      payload,
      String(booking.reservationId),
      booking.cancelToken,
      new Date(),
      gateway,
    )

    expect(cancelRes.status).toBe('cancelled')
    expect(cancelRes.refund).toBe('refund_requested')
    expect(refunds.length).toBe(0) // No auto-refund

    // Staff resolves refund request with approve
    const staffRes = await resolveRefundRequest(payload, {
      orderId: String(booking.orderId),
      action: 'approve',
      actorId: 'staff:123',
      gateway,
    })

    expect(staffRes.status).toBe('refunded')
    expect(refunds.length).toBe(1)
    expect(refunds[0].paymentIntentId).toBe(booking.paymentIntentId)
    expect(refunds[0].idempotencyKey).toBe(`refund-${booking.orderId}`)
  })
})
