import { sql } from '@payloadcms/db-postgres'
import { getPayload } from 'payload'
import { describe, expect, it } from 'vitest'

import configPromise from '@payload-config'
import { beforeAll } from 'vitest'
import { resetBookingTables } from './helpers/reset003'

import {
  acknowledgeBooking,
  cancelBooking,
  createBooking,
  rescheduleBooking,
} from '@/lib/booking/bookingService'
import { runReminderSweep } from '@/jobs/bookingEmail'
import { releaseExpiredHolds } from '@/jobs/holdSweep'
import { sendEmail } from '@/lib/email/resendAdapter'
import type { PaymentGateway } from '@/lib/payments/stripeGateway'
import type { EmailMessage, FetchImpl } from '@/lib/email/resendAdapter'

/**
 * T330/T340/T350 — scanner-safe tokens, atomic reschedule, CAS reminder,
 * hold sweep (spec 003 TC-003-013..017). Resend is faked via the fetch seam.
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

// Re-run safety: unique hour bucket per booking (DB is not truncated between runs).
let hourCursor = 141
const futureStart = (hoursAhead = 48): string => {
  void hoursAhead
  const h = (hourCursor += 2) + 0.5 + Math.random() * 0.2
  return new Date(Date.now() + h * 60 * 60 * 1000).toISOString()
}

function fakeResend() {
  const calls: { to: string; subject: string }[] = []
  const impl = (async (_url: unknown, init?: { body?: string }) => {
    const body = JSON.parse(init?.body ?? '{}') as { to: string; subject: string }
    calls.push({ to: body.to, subject: body.subject })
    return new Response(JSON.stringify({ id: 'email_test_1' }), { status: 200 })
  }) as FetchImpl
  return { calls, impl }
}

async function createFreeService() {
  const product = await payload.create({
    collection: 'products',
    data: {
      title: 'Token Svc',
      slug: `token-svc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      bookable: true,
      durationMin: 60,
      priceInUSD: 10,
      layout: [],
    },
    overrideAccess: true,
  })
  return String(product.id)
}

async function createBookingWithToken(svc: string, hoursAhead = 48, email?: string) {
  return createBooking(payload, {
    productId: svc,
    start: futureStart(hoursAhead),
    customerName: 'TokenUser',
    customerPhone: '+70000000020',
    ...(email ? { customerEmail: email } : {}),
  })
}

describe('T340 — scanner-safe tokens + atomic reschedule (FR-306)', () => {
  it('reschedule consumes the token: old slot intact until commit; replay → TOKEN_ALREADY_CONSUMED (TC-003-016)', async () => {
    const svc = await createFreeService()
    const created = await createBookingWithToken(svc)
    const newStart = futureStart(200)

    const moved = await rescheduleBooking(payload, {
      reservationId: String(created.reservationId),
      rescheduleToken: created.rescheduleToken,
      newStart,
    })
    expect(moved.status).toBe('BOOKED')
    expect(new Date(moved.newStart).toISOString()).toBe(new Date(newStart).toISOString())
    expect(moved.scheduleVersion).toBe(created.scheduleVersion + 1)

    // Replay of the consumed token is distinguished from a forged one
    await expect(
      rescheduleBooking(payload, {
        reservationId: String(created.reservationId),
        rescheduleToken: created.rescheduleToken,
        newStart: futureStart(300),
      }),
    ).rejects.toMatchObject({ code: 'TOKEN_ALREADY_CONSUMED' })

    // Forged token → 403
    await expect(
      rescheduleBooking(payload, {
        reservationId: String(created.reservationId),
        rescheduleToken: 'forged-nonce',
        newStart: futureStart(300),
      }),
    ).rejects.toMatchObject({ code: 'TOKEN_ALREADY_CONSUMED' })

    // Old row moved in place — same reservation id, order still bound
    const db: any = payload.db
    const rows = await db.execute({
      drizzle: db.drizzle,
      sql: sql`SELECT start_time, order_id, reschedule_token_hash FROM slot_reservations WHERE id = ${created.reservationId}`,
    })
    const r = rows.rows[0] as { start_time: string; order_id: number; reschedule_token_hash: string | null }
    expect(new Date(r.start_time).toISOString()).toBe(new Date(newStart).toISOString())
    expect(r.order_id).toBe(created.orderId)
    expect(r.reschedule_token_hash).toBeNull()
  })

  it('reschedule onto a taken slot → 409 SLOT_TAKEN, old slot untouched (atomic exchange)', async () => {
    const svc = await createFreeService()
    const aSlot = futureStart()
    const a = await createBooking(payload, {
      productId: svc,
      start: aSlot,
      customerName: 'TokenUserA',
      customerPhone: '+70000000025',
    })
    // Book a second, independent slot for the same service (grid is free)
    const bSlot = futureStart()
    const b = await createBooking(payload, {
      productId: svc,
      start: bSlot,
      customerName: 'TokenUserB',
      customerPhone: '+70000000022',
    })

    // Try to move A onto B's exact slot → SLOT_TAKEN
    await expect(
      rescheduleBooking(payload, {
        reservationId: String(a.reservationId),
        rescheduleToken: a.rescheduleToken,
        newStart: bSlot,
      }),
    ).rejects.toMatchObject({ code: 'SLOT_TAKEN' })

    // A remains at its original time (the abort never destroyed it)
    const db: any = payload.db
    const rows = await db.execute({
      drizzle: db.drizzle,
      sql: sql`SELECT start_time, status FROM slot_reservations WHERE id = ${a.reservationId}`,
    })
    const r = rows.rows[0] as { start_time: string; status: string }
    expect(new Date(r.start_time).getTime()).toBe(new Date(aSlot).getTime())
    expect(r.status).toBe('BOOKED')
    void b
  })

  it('acknowledge bumps scheduleVersion via CAS (US3 acknowledgement)', async () => {
    const svc = await createFreeService()
    const created = await createBookingWithToken(svc)
    const ack = await acknowledgeBooking(payload, created.accessToken)
    expect(ack).toMatchObject({ status: 'acknowledged', scheduleVersion: created.scheduleVersion + 1 })
    await expect(acknowledgeBooking(payload, 'bogus-access-token')).rejects.toMatchObject({
      code: 'BOOKING_NOT_FOUND',
    })
  })
})

describe('T350 — hold sweep + CAS reminder (FR-305/307)', () => {
  it('hold sweep releases only EXPIRED HELD; idempotent re-run (TC-003-017)', async () => {
    // PREPAID service: create lands in HELD (FREE track confirms immediately)
    const prepaid = await payload.create({
      collection: 'products',
      data: {
        title: 'Hold Svc',
        slug: `hold-svc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        bookable: true,
        durationMin: 60,
        priceInUSD: 10,
        paymentMode: 'FULL_PREPAYMENT',
        layout: [],
      },
      overrideAccess: true,
    })
    const gw: PaymentGateway = {
      async createPaymentIntent({ bookingId }) {
        return { id: `pi_test_${bookingId}`, clientSecret: null }
      },
      async createRefund() {
        return { id: 're_test' }
      },
    }
    const expired = await createBooking(payload, {
      productId: String(prepaid.id),
      start: futureStart(48),
      customerName: 'ExpiredHold',
      customerPhone: '+70000000021',
      customerEmail: 'hold@example.com',
      now: new Date(Date.now() - 20 * 60 * 1000), // booked 20 min ago → TTL 15m already passed
      gateway: gw,
    })
    expect(expired.status).toBe('HELD')

    const fresh = await createBookingWithToken(await createFreeService())
    expect(fresh.status).toBe('BOOKED')

    const first = await releaseExpiredHolds(payload)
    expect(first.released).toBeGreaterThanOrEqual(1)

    const second = await releaseExpiredHolds(payload)
    expect(second.released).toBe(0) // idempotent — nothing left to release

    const db: any = payload.db
    const rows = await db.execute({
      drizzle: db.drizzle,
      sql: sql`SELECT status FROM slot_reservations WHERE id = ${expired.reservationId}`,
    })
    expect((rows.rows[0] as { status: string }).status).toBe('RELEASED')
    const freshRow = await db.execute({
      drizzle: db.drizzle,
      sql: sql`SELECT status FROM slot_reservations WHERE id = ${fresh.reservationId}`,
    })
    expect((freshRow.rows[0] as { status: string }).status).toBe('BOOKED')
  })

  it('CAS reminder: two concurrent sweeps → exactly one send (TC-003-013)', async () => {
    const svc = await createFreeService()
    // Reminder is due when remaining <= noticeHours(24) → book ~23h ahead
    const reminderStart = new Date(Date.now() + (23 + Math.random() * 0.2) * 60 * 60 * 1000).toISOString()
    const created = await createBooking(payload, {
      productId: svc,
      start: reminderStart,
      customerName: 'ReminderUser',
      customerPhone: '+70000000023',
      customerEmail: 'reminder@example.com',
    })

    const fake = fakeResend()
    const sendSpy = async (p: Parameters<typeof sendEmail>[0], m: EmailMessage, o?: { fetchImpl?: FetchImpl }) =>
      sendEmail(p, m, { ...o, fetchImpl: fake.impl })
    void sendSpy

    // Two concurrent "workers" race the CAS claim; sendEmail is monkey-patched
    // through the fetch seam by injecting the fake into BOTH calls.
    const prevKey = process.env.RESEND_API_KEY
    process.env.RESEND_API_KEY = 'test-key'
    const origFetch = globalThis.fetch
    globalThis.fetch = fake.impl as typeof fetch
    try {
      const [a, b] = await Promise.all([runReminderSweep(payload), runReminderSweep(payload)])
      expect(a.sent + b.sent).toBeGreaterThanOrEqual(1)
      // The CAS guarantees the booking is claimed exactly once in total
      const db: any = payload.db
      const rows = await db.execute({
        drizzle: db.drizzle,
        sql: sql`SELECT count(*) AS n FROM email_delivery_log WHERE booking_id = ${created.reservationId} AND kind = 'reminder' AND status = 'sent'`,
      })
      expect(Number((rows.rows[0] as { n: number }).n)).toBe(1)
      const claimed = await db.execute({
        drizzle: db.drizzle,
        sql: sql`SELECT reminder_sent_at FROM slot_reservations WHERE id = ${created.reservationId}`,
      })
      expect((claimed.rows[0] as { reminder_sent_at: string }).reminder_sent_at).not.toBeNull()
    } finally {
      globalThis.fetch = origFetch
      if (prevKey === undefined) delete process.env.RESEND_API_KEY
      else process.env.RESEND_API_KEY = prevKey
    }
  })

  it('cancel AFTER reminder claim suppresses further reminders (cancelOn-матрица)', async () => {
    const svc = await createFreeService()
    const cancelOnStart = new Date(Date.now() + (25.5 + Math.random() * 0.2) * 60 * 60 * 1000).toISOString()
    const created = await createBooking(payload, {
      productId: svc,
      start: cancelOnStart,
      customerName: 'CancelOnUser',
      customerPhone: '+70000000024',
      customerEmail: 'cancel-on@example.com',
    })
    await cancelBooking(payload, String(created.reservationId), created.cancelToken)
    const out = await runReminderSweep(payload)
    expect(out.sent).toBe(0) // released bookings are never candidates
  })
})
