import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'
import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import {
  transitionBookingFsm,
  DB_TO_SPEC_BOOKING_STATE,
  SPEC_TO_DB_RESERVATION_STATUS,
  type BookingFsmState,
  type BookingTrack,
} from '@/lib/kernel/bookingFsm'
import { toAmountMinor, isBeforeCancellationCutoff } from '@/lib/payments/amounts'
import { assertProviderAmountMatch } from '@/lib/payments/invariants'
import { stripeGateway, type PaymentGateway } from '@/lib/payments/stripeGateway'
import { verifyTokenHash, hashToken } from '@/lib/booking/tokens'
import { notifySlotFreed } from '@/lib/waitlist/waitlistService'

/**
 * Booking domain service (spec 002-booking-domain US5/US6, research D4;
 * extended by spec 003-no-show-protection US1–US4, research D4–D6):
 * the ONLY status-writer in the system. All writes happen inside a drizzle
 * transaction with an xact-scoped advisory lock (L1); the partial GiST
 * exclusion constraint (L2) is the DB-level backstop. Verified live:
 * `payload.db.drizzle.transaction(async (trx) => trx.execute(sql`...`))`.
 */

export class BookingError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

const ACTIVE_STATUSES_SQL = "('HELD', 'BOOKED', 'PENDING_APPROVAL')"

export interface CreateBookingInput {
  productId: string
  resourceId?: string | number
  start: string
  customerName: string
  customerPhone: string
  customerEmail?: string
  idempotencyKey?: string
  now?: Date
  /**
   * Gateway seam for tests (spec 003 research D4). NEVER part of the public API
   * contract: `paymentMode` is read strictly from the Product server-side —
   * client input is structurally impossible to inject (review F7).
   */
  gateway?: PaymentGateway
}

export type PaymentMode = 'NONE' | 'FULL_PREPAYMENT'

export interface BookingResult {
  reservationId: number
  orderId: number
  accessToken: string
  cancelToken: string
  /** One-time reschedule nonce (hash stored on the row) — 003 FR-306. */
  rescheduleToken: string
  status: string
  scheduleVersion: number
  paymentMode: PaymentMode
  paymentIntentId?: string | null
  clientSecret?: string | null
}

/** drizzle 0.45 wraps pg errors in DrizzleQueryError — the PG code lives on `.cause`. */
export function pgErrorCode(err: unknown): string | undefined {
  const e = err as { code?: string; cause?: { code?: string } }
  return e?.code ?? e?.cause?.code
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

function timingSafeHexMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b || a.length !== b.length) return false
  return timingSafeEqual(Buffer.from(a, 'utf-8'), Buffer.from(b, 'utf-8'))
}

export async function findBookingByIdempotencyKey(
  payload: Payload,
  idempotencyKey: string,
): Promise<BookingResult | null> {
  const res = await payload.db.execute({
    drizzle: (payload.db as unknown as { drizzle: any }).drizzle,
    sql: sql`SELECT sr.id AS reservation_id, sr.status, sr.schedule_version, sr.order_id, o.access_token
             FROM slot_reservations sr JOIN orders o ON o.id = sr.order_id
             WHERE sr.idempotency_key = ${idempotencyKey} LIMIT 1`,
  })
  const row = res.rows?.[0] as
    | { reservation_id: number; status: string; schedule_version: number; order_id: number; access_token: string }
    | undefined
  if (!row) return null
  return {
    reservationId: Number(row.reservation_id),
    orderId: Number(row.order_id),
    accessToken: row.access_token,
    cancelToken: '', // already issued on the first call — not re-issued
    rescheduleToken: '', // ditto
    status: row.status,
    scheduleVersion: Number(row.schedule_version),
    paymentMode: 'NONE', // idempotent replay of the first call — original mode is not re-derived
  }
}

export async function createBooking(
  payload: Payload,
  input: CreateBookingInput,
): Promise<BookingResult> {
  const now = input.now ?? new Date()
  const start = new Date(input.start)
  if (Number.isNaN(start.getTime()) || start.getTime() <= now.getTime()) {
    throw new BookingError('SLOT_IN_PAST', 422, 'Booking start must be in the future')
  }

  if (input.idempotencyKey) {
    const existing = await findBookingByIdempotencyKey(payload, input.idempotencyKey)
    if (existing) return existing
  }

  let product: Record<string, unknown>
  try {
    product = (await payload.findByID({
      collection: 'products',
      id: input.productId,
      overrideAccess: true,
      depth: 0,
    })) as unknown as Record<string, unknown>
  } catch {
    throw new BookingError('SERVICE_NOT_FOUND', 404, 'Service not found')
  }
  if (!product || (product as { deletedAt?: string | null }).deletedAt || product.bookable !== true) {
    throw new BookingError('SERVICE_NOT_BOOKABLE', 422, 'Service is not bookable')
  }
  const durationMin = product.durationMin as number
  if (typeof durationMin !== 'number' || durationMin < 5) {
    throw new BookingError('SERVICE_NOT_BOOKABLE', 422, 'Service is missing durationMin')
  }
  const bufferBeforeMin = (product.bufferBeforeMin as number) ?? 0
  const bufferAfterMin = (product.bufferAfterMin as number) ?? 0
  const end = new Date(start.getTime() + durationMin * 60_000)

  // Deposit policy (spec 003 FR-301): paymentMode is read STRICTLY from the
  // Product on the server — the client API has no paymentMode field at all.
  const paymentMode: PaymentMode = product.paymentMode === 'FULL_PREPAYMENT' ? 'FULL_PREPAYMENT' : 'NONE'
  if (paymentMode === 'FULL_PREPAYMENT' && !input.customerEmail) {
    throw new BookingError('EMAIL_REQUIRED', 422, 'Email is required for full-prepayment services')
  }
  const amountMinor =
    paymentMode === 'FULL_PREPAYMENT' ? toAmountMinor(product.priceInUSD as number) : 0
  const track: BookingTrack = paymentMode === 'FULL_PREPAYMENT' ? 'PREPAID' : 'FREE'

  let resourceId: string | number | undefined = input.resourceId
  if (!resourceId) {
    const active = await payload.find({
      collection: 'resources',
      where: { active: { equals: true } },
      limit: 1,
      overrideAccess: true,
      depth: 0,
    })
    resourceId = active.docs[0]?.id
  }
  if (!resourceId) throw new BookingError('RESOURCE_NOT_FOUND', 422, 'No active booking resource')

  // OUT_CALL services always require OPERATOR approval (FSM PENDING_APPROVAL).
  const fulfillment = (product.outCallEnabled === true ? 'OUT_CALL' : 'IN_CALL') as
    | 'IN_CALL'
    | 'OUT_CALL'
  const requiresApproval = fulfillment === 'OUT_CALL'

  const accessToken = randomUUID()
  const cancelToken = randomUUID()
  const cancelTokenHash = sha256Hex(cancelToken)
  const rescheduleToken = randomUUID()
  const rescheduleTokenHash = hashToken(rescheduleToken)

  const db: any = payload.db
  try {
    const result: BookingResult = await db.drizzle.transaction(async (trx: any) => {
      // L1: serialize concurrent bookings for the SAME resource only.
      await trx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext('resource_slot_lock_' || ${resourceId}))`,
      )

      // Re-check overlap (with BOTH buffers in the span) — GiST is the backstop.
      const clash = await trx.execute(sql`
        SELECT 1 FROM slot_reservations
        WHERE resource_id = ${resourceId}
          AND status IN ('HELD', 'BOOKED', 'PENDING_APPROVAL')
          AND tstzrange("start_time" - make_interval(mins => ${bufferBeforeMin}),
                         "end_time"   + make_interval(mins => ${bufferAfterMin}))
              && tstzrange(${start.toISOString()}, ${end.toISOString()})
        LIMIT 1`)
      if (clash.rows.length > 0) {
        throw new BookingError('SLOT_TAKEN', 409, 'The slot has just been taken')
      }

      const fsm = transitionBookingFsm('AVAILABLE', 'CREATE_BOOKING', {
        now,
        track,
        requiresApproval,
      })
      if (!fsm.ok) {
        throw new BookingError('FSM_REJECTED', 422, fsm.reason)
      }
      const dbStatus = SPEC_TO_DB_RESERVATION_STATUS[fsm.state as BookingFsmState]
      const holdExpiresAt = fsm.effects.holdExpiresAt ?? null

      const order = await trx.execute(sql`
        INSERT INTO orders (customer_email, status, amount, currency, access_token, created_at, updated_at)
        VALUES (${input.customerEmail ?? null}, 'processing', ${amountMinor}, 'USD', ${accessToken}, now(), now())
        RETURNING id`)

      const orderId = (order.rows[0] as { id: number }).id

      const reservation = await trx.execute(sql`
        INSERT INTO slot_reservations
          (order_id, resource_id, item_id, start_time, end_time, total_duration_min,
           status, schedule_version, hold_expires_at, hold_frozen_at,
           buffer_before_min, buffer_after_min,
           customer_name, customer_phone, idempotency_key, cancel_token_hash, reschedule_token_hash,
           created_at, updated_at)
        VALUES
          (${orderId}, ${resourceId}, ${input.productId}, ${start.toISOString()}, ${end.toISOString()},
           ${durationMin}, ${dbStatus}, 1, ${holdExpiresAt ? holdExpiresAt.toISOString() : null}, null,
           ${bufferBeforeMin}, ${bufferAfterMin},
           ${input.customerName}, ${input.customerPhone}, ${input.idempotencyKey ?? null},
           ${cancelTokenHash}, ${rescheduleTokenHash}, now(), now())
        RETURNING id, schedule_version`)

      const row = reservation.rows[0] as { id: number; schedule_version: number }

      await trx.execute(sql`
        INSERT INTO audit_events (action, actor_id, aggregate_type, aggregate_id, metadata_json, created_at, updated_at)
        VALUES ('booking.create', 'CUSTOMER', 'BOOKING', ${String(row.id)},
                ${JSON.stringify({ fulfillment, resourceId })}::jsonb, now(), now())`)

      return {
        reservationId: Number(row.id),
        orderId: Number(orderId),
        accessToken,
        cancelToken,
        rescheduleToken,
        status: dbStatus,
        scheduleVersion: Number(row.schedule_version),
        paymentMode,
      }
    })

    // Confirmation email (spec 003 FR-305): queued, never inline — delivery
    // failures must not fail the booking. Email-less bookings skip silently.
    if (input.customerEmail) {
      try {
        await payload.jobs.queue({
          task: 'booking-email',
          input: {
            kind: 'confirmation',
            reservationId: result.reservationId,
            email: input.customerEmail,
            customerName: input.customerName,
            cancelToken,
            rescheduleToken,
            accessToken,
          },
        })
      } catch (queueErr: unknown) {
        payload.logger.error({
          err: queueErr,
          message: 'booking-email queueing failed (booking itself is fine)',
        })
      }
    }

    // PREPAID: PaymentIntent is created strictly AFTER the booking commit
    // (research D4) — no orphan payment without a reservation. On PI failure the
    // slot is released IMMEDIATELY (review F-PI: never marinate 15 min), and the
    // caller gets a 502 PAYMENT_INIT_FAILED.
    if (paymentMode === 'FULL_PREPAYMENT') {
      const gateway = input.gateway ?? stripeGateway
      try {
        const intent = await gateway.createPaymentIntent({
          amountMinor,
          currency: 'USD',
          bookingId: result.reservationId,
        })
        await payload.db.execute({
          drizzle: db.drizzle,
          sql: sql`UPDATE orders SET stripe_payment_intent_ref = ${intent.id}, updated_at = now()
                   WHERE id = ${result.orderId}`,
        })
        result.paymentIntentId = intent.id
        result.clientSecret = intent.clientSecret
      } catch (piErr: unknown) {
        console.error('[003-debug] PI block error:', piErr)
        if (piErr instanceof BookingError) {
          await releaseAfterPaymentInitFailure(payload, result.reservationId, result.orderId)
          throw piErr
        }
        await releaseAfterPaymentInitFailure(payload, result.reservationId, result.orderId)
        throw new BookingError('PAYMENT_INIT_FAILED', 502, 'Payment could not be initiated')
      }
    }

    // Staff pager (spec 004 FR-402/D9): card to every staff chat via outbox.
    // Booking flow never blocks on Telegram (enqueue is best-effort).
    try {
      const { staffChatTargets } = await import('@/lib/telegram/staffAuth')
      const { enqueueStaffCard } = await import('@/lib/telegram/staffBot')
      await enqueueStaffCard(
        payload,
        {
          reservationId: result.reservationId,
          scheduleVersion: result.scheduleVersion,
          customerName: input.customerName,
          customerPhone: input.customerPhone,
          serviceName: (product.title as string) ?? null,
          durationMin,
          startTime: start.toISOString(),
          timeZone: ((await payload.findGlobal({ slug: 'shop-settings', depth: 0 })) as { timeZone?: string } | null)?.timeZone || 'UTC',
          fulfillment,
        },
        await staffChatTargets(payload),
      )
    } catch (pagerErr: unknown) {
      payload.logger.error({ err: pagerErr, message: 'staff pager enqueue failed (booking itself is fine)' })
    }

    return result
  } catch (err: unknown) {
    if (err instanceof BookingError) throw err
    const pgCode = pgErrorCode(err)
    if (pgCode === '23P01') {
      // GiST exclusion backstop fired — another transaction won the slot.
      throw new BookingError('SLOT_TAKEN', 409, 'The slot has just been taken')
    }
    if (pgCode === '23505' && input.idempotencyKey) {
      const existing = await findBookingByIdempotencyKey(payload, input.idempotencyKey)
      if (existing) return existing
    }
    throw err
  }
}

export interface CancelBookingResult {
  status: 'cancelled' | 'already_cancelled'
  scheduleVersion: number
  /** Refund outcome per the 003 cutoff policy (FR-304); absent when no money was captured. */
  refund?: 'auto-refunded' | 'refund_requested' | 'refund_failed'
}

export async function cancelBooking(
  payload: Payload,
  reservationId: string,
  cancelToken: string,
  now = new Date(),
  gateway?: PaymentGateway,
): Promise<CancelBookingResult> {
  const db: any = payload.db
  const rowRes = await db.execute({
    drizzle: db.drizzle,
    sql: sql`SELECT sr.id, sr.status, sr.schedule_version, sr.order_id, sr.cancel_token_hash,
                    sr.start_time, sr.item_id,
                    o.amount, o.status AS order_status, o.stripe_payment_intent_ref AS stripe_payment_intent_id,
                    p.payment_mode, p.cancellation_cutoff_hours
             FROM slot_reservations sr
             JOIN orders o ON o.id = sr.order_id
             LEFT JOIN products p ON p.id::text = sr.item_id
             WHERE sr.id = ${reservationId} LIMIT 1`,
  })
  const row = rowRes.rows?.[0] as
    | {
        id: number
        status: string
        schedule_version: number
        order_id: number
        cancel_token_hash: string | null
        start_time: string
        end_time: string
        item_id: string | null
        resource_id: string
        amount: number
        order_status: string
        stripe_payment_intent_id: string | null
        payment_mode: string | null
        cancellation_cutoff_hours: number | null
      }
    | undefined
  if (!row) throw new BookingError('BOOKING_NOT_FOUND', 404, 'Booking not found')

  if (!timingSafeHexMatch(sha256Hex(cancelToken), row.cancel_token_hash)) {
    throw new BookingError('INVALID_TOKEN', 403, 'Invalid cancel token')
  }

  if (row.status === 'RELEASED') {
    // Spec 003 US4 AC2: a replayed one-time token is rejected, not silently ACKed.
    throw new BookingError('TOKEN_ALREADY_CONSUMED', 409, 'Cancel token has already been used')
  }

  const specState: BookingFsmState | null = DB_TO_SPEC_BOOKING_STATE[row.status as keyof typeof DB_TO_SPEC_BOOKING_STATE] ?? null
  if (!specState) {
    throw new BookingError('FSM_REJECTED', 422, `Unmappable DB status ${row.status}`)
  }

  const fsm = transitionBookingFsm(specState, 'CUSTOMER_CANCEL', { now })
  if (!fsm.ok) throw new BookingError('FSM_REJECTED', 422, fsm.reason)
  if (!fsm.effects.release) throw new BookingError('FSM_REJECTED', 422, 'cancel produced no release')

  // Refund policy (spec 003 FR-304, review F2/F13): money is auto-refunded ONLY
  // while `now < start - cutoff` (strictly exclusive); past the boundary the
  // order goes to `refund_requested` with the 24h staff SLA.
  // orders.amount is NUMERIC — pg returns it as a string; coerce before comparing.
  const amountNum = Number(row.amount)
  const paid =
    row.order_status === 'completed' &&
    Number.isFinite(amountNum) &&
    amountNum > 0 &&
    Boolean(row.stripe_payment_intent_id)
  const cutoffHours = row.cancellation_cutoff_hours ?? 3
  const beforeCutoff = isBeforeCancellationCutoff({
    start: new Date(row.start_time),
    cancellationCutoffHours: cutoffHours,
    now,
  })

  let refund: CancelBookingResult['refund']
  if (paid) {
    // Both branches start in refund_requested (enum-safe): pre-cutoff the Stripe
    // refund settles it to 'refunded' right after the commit; failure lands in
    // the verifiable 'refund_failed' tail; post-cutoff stays for staff SLA.
    refund = beforeCutoff ? 'auto-refunded' : 'refund_requested'
  }

  await db.drizzle.transaction(async (trx: any) => {
    await trx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext('resource_slot_cancel_' || ${row.id}))`,
    )
    const cas = await trx.execute(sql`
      UPDATE slot_reservations
      SET status = 'RELEASED', schedule_version = schedule_version + 1, updated_at = now()
      WHERE id = ${row.id} AND schedule_version = ${row.schedule_version}
      RETURNING schedule_version`)
    if (cas.rows.length === 0) {
      // Concurrent winner (approve/another cancel) — token is consumed either way.
      throw new BookingError('TOKEN_ALREADY_CONSUMED', 409, 'Cancel token has already been used')
    }
    await trx.execute(
      sql`UPDATE orders SET status = ${paid ? 'refund_requested' : 'cancelled'}, updated_at = now()
          WHERE id = ${row.order_id}`,
    )
    await trx.execute(sql`
      INSERT INTO audit_events (action, actor_id, aggregate_type, aggregate_id, metadata_json, created_at, updated_at)
      VALUES ('booking.cancel', 'CUSTOMER', 'BOOKING', ${String(row.id)},
              ${JSON.stringify({ via: 'cancel-endpoint', refund: refund ?? 'not-applicable', cutoffHours })}::jsonb, now(), now())`)
  })

  // Waitlist: a freed slot re-enters the queue (best-effort, spec 006 FR-602).
  try {
    await notifySlotFreed(payload, {
      resourceId: row.resource_id,
      productId: row.item_id as string,
      slotStart: new Date(row.start_time),
      slotEnd: new Date(row.end_time),
    })
  } catch (wlErr: unknown) {
    payload.logger.error({ err: wlErr, message: 'waitlist notifySlotFreed failed (cancel continues)' })
  }

  // Stripe refund strictly AFTER the release commit (research D5): a network
  // call never holds the advisory-locked transaction open.
  if (refund === 'auto-refunded') {
    const gw = gateway ?? stripeGateway
    try {
      await gw.createRefund({ paymentIntentId: row.stripe_payment_intent_id as string })
      await db.execute({
        drizzle: db.drizzle,
        sql: sql`UPDATE orders SET status = 'refunded', updated_at = now() WHERE id = ${row.order_id}`,
      })
      await db.execute({
        drizzle: db.drizzle,
        sql: sql`INSERT INTO audit_events (action, actor_id, aggregate_type, aggregate_id, metadata_json, created_at, updated_at)
                 VALUES ('payment.refund.auto', 'SYSTEM', 'ORDER', ${String(row.order_id)}, '{}'::jsonb, now(), now())`,
      })
    } catch {
      // Refund failed — money is NOT lost: the order goes to a verifiable
      // staff-visible tail state (spec 003 FR-304 / research D5).
      refund = 'refund_failed'
      await db.execute({
        drizzle: db.drizzle,
        sql: sql`UPDATE orders SET status = 'refund_failed', updated_at = now() WHERE id = ${row.order_id}`,
      })
      await db.execute({
        drizzle: db.drizzle,
        sql: sql`INSERT INTO audit_events (action, actor_id, aggregate_type, aggregate_id, metadata_json, created_at, updated_at)
                 VALUES ('payment.alert', 'SYSTEM', 'ORDER', ${String(row.order_id)},
                         ${JSON.stringify({ reason: 'REFUND_FAILED' })}::jsonb, now(), now())`,
      })
    }
  }

  return { status: 'cancelled', scheduleVersion: Number(row.schedule_version) + 1, refund }
}

export type ApprovalAction = 'approve' | 'reject'

export type ApprovalResult =
  | {
      status: 'approved' | 'rejected' | 'ALREADY_PROCESSED'
      scheduleVersion: number
      /** Set on reject — waitlist hook consumes it (spec 006 FR-602). */
      releasedSlot?: { resourceId: string; productId: string | null; slotStart: string; slotEnd: string }
    }

/** OPERATOR approve/reject via FSM CAS (spec 002-booking-domain US6, research D4). */
export async function approveBooking(
  payload: Payload,
  input: { reservationId: string; action: ApprovalAction; actorId: string },
): Promise<ApprovalResult> {
  const db: any = payload.db
  try {
    const result: ApprovalResult = await db.drizzle.transaction(async (trx: any) => {
      const rowRes = await trx.execute(sql`
        SELECT id, status, schedule_version, order_id, resource_id, item_id, start_time, end_time
        FROM slot_reservations WHERE id = ${input.reservationId} FOR UPDATE`)
      const row = rowRes.rows?.[0] as
        | { id: string; status: string; schedule_version: number; order_id: number; resource_id: string; item_id: string | null; start_time: string; end_time: string }
        | undefined
      if (!row) throw new BookingError('BOOKING_NOT_FOUND', 404, 'Booking not found')
      if (row.status !== 'PENDING_APPROVAL') {
        return { status: 'ALREADY_PROCESSED', scheduleVersion: Number(row.schedule_version) }
      }

      const event = input.action === 'approve' ? 'STAFF_APPROVE' : 'STAFF_REJECT'
      const fsm = transitionBookingFsm('PENDING_APPROVAL', event, { now: new Date() })
      if (!fsm.ok) throw new BookingError('FSM_REJECTED', 422, fsm.reason)
      const dbStatus = fsm.state === 'CONFIRMED' ? 'BOOKED' : 'RELEASED'

      const cas = await trx.execute(sql`
        UPDATE slot_reservations
        SET status = ${dbStatus}, schedule_version = schedule_version + 1, updated_at = now()
        WHERE id = ${row.id} AND schedule_version = ${row.schedule_version}
        RETURNING schedule_version`)
      if (cas.rows.length === 0) {
        return { status: 'ALREADY_PROCESSED', scheduleVersion: Number(row.schedule_version) }
      }

      await trx.execute(sql`
        INSERT INTO audit_events (action, actor_id, aggregate_type, aggregate_id, metadata_json, created_at, updated_at)
        VALUES (${`approval.${input.action}`}, ${input.actorId}, 'BOOKING', ${String(row.id)},
                ${JSON.stringify({ scheduleVersion: row.schedule_version })}::jsonb, now(), now())`)

      return {
        status: input.action === 'approve' ? 'approved' : 'rejected',
        scheduleVersion: Number(row.schedule_version) + 1,
        releasedSlot: input.action === 'reject'
          ? { resourceId: row.resource_id, productId: row.item_id, slotStart: row.start_time, slotEnd: row.end_time }
          : undefined,
      }
    })
    // Waitlist: a rejected slot re-enters the queue (best-effort, spec 006 FR-602).
    if (result.releasedSlot) {
      try {
        await notifySlotFreed(payload, {
          resourceId: result.releasedSlot.resourceId,
          productId: result.releasedSlot.productId as string,
          slotStart: new Date(result.releasedSlot.slotStart),
          slotEnd: new Date(result.releasedSlot.slotEnd),
        })
      } catch (wlErr: unknown) {
        payload.logger.error({ err: wlErr, message: 'waitlist notifySlotFreed failed (reject continues)' })
      }
    }
    return result
  } catch (err: unknown) {
    if (err instanceof BookingError) throw err
    const pgCode = pgErrorCode(err)
    if (pgCode === '23P01') throw new BookingError('SLOT_TAKEN', 409, 'Slot re-booked during approval')
    throw err
  }
}

// ---------------------------------------------------------------------------
// 003-no-show-protection: gateway events, reschedule, acknowledgement
// ---------------------------------------------------------------------------

/** Immediate release after a PaymentIntent-creation failure (research D4). */
async function releaseAfterPaymentInitFailure(
  payload: Payload,
  reservationId: number,
  orderId: number,
): Promise<void> {
  const db: any = payload.db
  let released: { rows?: Array<{ resource_id: string; item_id: string; start_time: string; end_time: string }> } | undefined
  await db.drizzle.transaction(async (trx: any) => {
    await trx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext('resource_slot_cancel_' || ${reservationId}))`,
    )
    released = await trx.execute(sql`
      UPDATE slot_reservations
      SET status = 'RELEASED', schedule_version = schedule_version + 1, updated_at = now()
      WHERE id = ${reservationId} AND status = 'HELD'
      RETURNING resource_id, item_id, start_time, end_time`)
    await trx.execute(
      sql`UPDATE orders SET status = 'cancelled', updated_at = now() WHERE id = ${orderId}`,
    )
    await trx.execute(sql`
      INSERT INTO audit_events (action, actor_id, aggregate_type, aggregate_id, metadata_json, created_at, updated_at)
      VALUES ('booking.release.payment-init-failed', 'SYSTEM', 'BOOKING', ${String(reservationId)}, '{}'::jsonb, now(), now())`)
  })
  const rel = (released as any)?.rows?.[0] as { resource_id: string; item_id: string; start_time: string; end_time: string } | undefined
  if (rel) {
    try {
      await notifySlotFreed(payload, {
        resourceId: rel.resource_id,
        productId: rel.item_id,
        slotStart: new Date(rel.start_time),
        slotEnd: new Date(rel.end_time),
      })
    } catch (wlErr: unknown) {
      payload.logger.error({ err: wlErr, message: 'waitlist notifySlotFreed failed (PI-fail release)' })
    }
  }
}

export interface GatewayEventInput {
  provider: string
  providerRef: string
  eventType: 'payment_intent.succeeded' | 'payment_intent.payment_failed' | 'charge.refunded'
  amountMinor?: number
  currency?: string
  now?: Date
}

export type GatewayEventResult = {
  deduped: boolean
  outcome: 'confirmed' | 'late-reconfirmed' | 'released' | 'paid-requires-resolution' | 'amount-mismatch' | 'refunded-settled' | 'ignored'
}

/**
 * Idempotent gateway-event fulfillment (spec 003 US2, research D2): the InboxEvent
 * dedupe insert and the domain writes share ONE transaction — a processing failure
 * rolls the dedupe back too, so the Stripe retry reprocesses cleanly (ACK matrix:
 * 5xx on failure, 200 no-op on true duplicates, never a silent loss).
 */
export async function applyGatewayEvent(
  payload: Payload,
  input: GatewayEventInput,
): Promise<GatewayEventResult> {
  const now = input.now ?? new Date()
  const db: any = payload.db
  let releasedSlot: { resourceId: string; productId: string | null; slotStart: Date; slotEnd: Date } | undefined
  const outcome = await db.drizzle.transaction(async (trx: any) => {
    const claim = await trx.execute(sql`
      INSERT INTO inbox_events (provider, provider_ref, created_at, updated_at)
      VALUES (${input.provider}, ${input.providerRef}, now(), now())
      ON CONFLICT DO NOTHING
      RETURNING id`)
    if (claim.rows.length === 0) {
      return { deduped: true, outcome: 'ignored' as const }
    }

    const rows = await trx.execute(sql`
      SELECT o.id AS order_id, o.amount, o.currency, o.status AS order_status,
             sr.id AS reservation_id, sr.status AS res_status, sr.schedule_version,
             sr.resource_id, sr.item_id, sr.start_time, sr.end_time
      FROM orders o
      JOIN slot_reservations sr ON sr.order_id = o.id
      WHERE o.stripe_payment_intent_ref = ${input.providerRef}
      ORDER BY sr.id DESC LIMIT 1`)
    const row = rows.rows?.[0] as
      | {
          order_id: number
          amount: number
          currency: string
          order_status: string
          reservation_id: number
          res_status: string
          schedule_version: number
          resource_id: string
          item_id: string | null
          start_time: string
          end_time: string
        }
      | undefined

    const ledger = async (status: string, extra: Record<string, unknown> = {}) => {
      await trx.execute(sql`
        INSERT INTO payment_events (provider, provider_ref, event_type, amount_minor, currency, status, payload_json, created_at, updated_at)
        VALUES (${input.provider}, ${input.providerRef}, ${input.eventType}, ${input.amountMinor ?? null},
                ${input.currency ?? null}, ${status}, ${JSON.stringify(extra)}::jsonb, now(), now())`)
    }

    if (!row) {
      await ledger('UNMATCHED')
      return { deduped: false, outcome: 'ignored' as const }
    }

    if (input.eventType === 'charge.refunded') {
      await trx.execute(
        sql`UPDATE orders SET status = 'refunded', updated_at = now() WHERE id = ${row.order_id}`,
      )
      await ledger('PROCESSED')
      await audit(trx, 'payment.refund.settled', 'ORDER', String(row.order_id), {})
      return { deduped: false, outcome: 'refunded-settled' as const }
    }

    if (input.eventType === 'payment_intent.succeeded') {
      // Fail-closed money invariant (001) stays in the live path (spec FR-303):
      const verdict = assertProviderAmountMatch({
        provider: 'STRIPE',
        amountMinor: input.amountMinor ?? -1,
        currency: input.currency ?? '',
        order: { amount: Number(row.amount), currency: row.currency },
      })
      if (!verdict.matches) {
        await ledger(`AMOUNT_MISMATCH:${verdict.reason}`)
        await audit(trx, 'payment.alert', 'ORDER', String(row.order_id), {
          reason: verdict.reason,
          providerRef: input.providerRef,
        })
        return { deduped: false, outcome: 'amount-mismatch' as const }
      }

      if (row.res_status === 'HELD' || row.res_status === 'PAYMENT_PENDING') {
        const fsm = transitionBookingFsm(
          DB_TO_SPEC_BOOKING_STATE[row.res_status as keyof typeof DB_TO_SPEC_BOOKING_STATE] as BookingFsmState,
          'GATEWAY_FINISHED',
          { now },
        )
        if (fsm.ok) {
          await trx.execute(sql`
            UPDATE slot_reservations
            SET status = 'BOOKED', hold_expires_at = null, hold_frozen_at = null,
                schedule_version = schedule_version + 1, updated_at = now()
            WHERE id = ${row.reservation_id} AND schedule_version = ${row.schedule_version}`)
          await trx.execute(
            sql`UPDATE orders SET status = 'completed', updated_at = now() WHERE id = ${row.order_id}`,
          )
          await ledger('PROCESSED')
          await audit(trx, 'payment.confirmed', 'BOOKING', String(row.reservation_id), { providerRef: input.providerRef })
          return { deduped: false, outcome: 'confirmed' as const }
        }
      }

      if (row.res_status === 'RELEASED') {
        // Late payment (FR-444/FR-432): slot still free → atomic re-confirm;
        // slot re-booked → PAID_REQUIRES_RESOLUTION + refund request. Never a
        // silent PAID (NFR-303).
        const clash = await trx.execute(sql`
          SELECT 1 FROM slot_reservations
          WHERE resource_id = ${row.resource_id}
            AND id <> ${row.reservation_id}
            AND status IN ('HELD', 'BOOKED', 'PENDING_APPROVAL')
            AND tstzrange(start_time, end_time) && tstzrange(${row.start_time}, ${row.end_time})
          LIMIT 1`)
        if (clash.rows.length === 0) {
          await trx.execute(sql`
            UPDATE slot_reservations
            SET status = 'BOOKED', hold_expires_at = null, hold_frozen_at = null,
                schedule_version = schedule_version + 1, updated_at = now()
            WHERE id = ${row.reservation_id} AND schedule_version = ${row.schedule_version}`)
          await trx.execute(
            sql`UPDATE orders SET status = 'completed', updated_at = now() WHERE id = ${row.order_id}`,
          )
          await ledger('PROCESSED')
          await audit(trx, 'payment.late-reconfirm', 'BOOKING', String(row.reservation_id), { providerRef: input.providerRef })
          return { deduped: false, outcome: 'late-reconfirmed' as const }
        }
        await trx.execute(
          sql`UPDATE orders SET status = 'paid_requires_resolution', updated_at = now() WHERE id = ${row.order_id}`,
        )
        await ledger('PROCESSED')
        await audit(trx, 'payment.late-resolution', 'ORDER', String(row.order_id), { providerRef: input.providerRef })
        return { deduped: false, outcome: 'paid-requires-resolution' as const }
      }

      await ledger('PROCESSED')
      return { deduped: false, outcome: 'ignored' as const }
    }

    // payment_intent.payment_failed: release only an unpaid hold (FSM GATEWAY_FAILED).
    if (row.res_status === 'HELD' || row.res_status === 'PAYMENT_PENDING') {
      await trx.execute(sql`
        UPDATE slot_reservations
        SET status = 'RELEASED', schedule_version = schedule_version + 1, updated_at = now()
        WHERE id = ${row.reservation_id} AND schedule_version = ${row.schedule_version}`)
      await trx.execute(
        sql`UPDATE orders SET status = 'cancelled', updated_at = now() WHERE id = ${row.order_id}`,
      )
      await ledger('PROCESSED')
      await audit(trx, 'payment.failed-release', 'BOOKING', String(row.reservation_id), { providerRef: input.providerRef })
      releasedSlot = { resourceId: String(row.resource_id), productId: row.item_id, slotStart: new Date(row.start_time), slotEnd: new Date(row.end_time) }
      return { deduped: false, outcome: 'released' as const }
    }

    await ledger('PROCESSED')
    return { deduped: false, outcome: 'ignored' as const }
  })
  // Waitlist: a payment-failed release frees the slot (best-effort, spec 006 FR-602).
  const slot = releasedSlot
  if (outcome.outcome === 'released' && slot && slot.productId) {
    try {
      await notifySlotFreed(payload, { resourceId: slot.resourceId, productId: slot.productId, slotStart: slot.slotStart, slotEnd: slot.slotEnd })
    } catch (wlErr: unknown) {
      payload.logger.error({ err: wlErr, message: 'waitlist notifySlotFreed failed (gateway release)' })
    }
  }
  return outcome
}

async function audit(trx: any, action: string, aggregateType: string, aggregateId: string, metadata: Record<string, unknown>) {
  await trx.execute(sql`
    INSERT INTO audit_events (action, actor_id, aggregate_type, aggregate_id, metadata_json, created_at, updated_at)
    VALUES (${action}, 'SYSTEM', ${aggregateType}, ${aggregateId}, ${JSON.stringify(metadata)}::jsonb, now(), now())`)
}

export interface RescheduleBookingInput {
  reservationId: string
  rescheduleToken: string
  newStart: string
  resourceId?: string | number
  now?: Date
}

export interface RescheduleBookingResult {
  status: string
  scheduleVersion: number
  newStart: string
}

/**
 * Atomic slot exchange (spec 003 US4, review F5): the old slot stays intact
 * until the new one is committed in the SAME transaction; a PREPAID order keeps
 * its amount and PaymentIntent (no double charge). A replayed token is detected
 * via the reschedule audit trail (the hash is consumed, so replay is
 * distinguished from a forged token).
 */
export async function rescheduleBooking(
  payload: Payload,
  input: RescheduleBookingInput,
): Promise<RescheduleBookingResult> {
  const now = input.now ?? new Date()
  const start = new Date(input.newStart)
  if (Number.isNaN(start.getTime()) || start.getTime() <= now.getTime()) {
    throw new BookingError('SLOT_IN_PAST', 422, 'New slot must be in the future')
  }

  const db: any = payload.db
  const rowRes = await db.execute({
    drizzle: db.drizzle,
    sql: sql`SELECT sr.id, sr.status, sr.schedule_version, sr.order_id, sr.resource_id,
                    sr.start_time, sr.end_time, sr.total_duration_min,
                    sr.buffer_before_min, sr.buffer_after_min, sr.reschedule_token_hash
             FROM slot_reservations sr WHERE sr.id = ${input.reservationId} LIMIT 1`,
  })
  const row = rowRes.rows?.[0] as
    | {
        id: number
        status: string
        schedule_version: number
        order_id: number
        resource_id: string
        start_time: string
        end_time: string
        total_duration_min: number
        buffer_before_min: number
        buffer_after_min: number
        reschedule_token_hash: string | null
      }
    | undefined
  if (!row) throw new BookingError('BOOKING_NOT_FOUND', 404, 'Booking not found')
  if (row.status === 'RELEASED') {
    throw new BookingError('BOOKING_NOT_ACTIVE', 422, 'Booking is cancelled')
  }

  const tokenValid = verifyTokenHash(input.rescheduleToken, row.reschedule_token_hash)
  if (!tokenValid) {
    const rescheduled = await db.execute({
      drizzle: db.drizzle,
      sql: sql`SELECT 1 FROM audit_events
               WHERE aggregate_type = 'BOOKING' AND aggregate_id = ${String(row.id)}
                 AND action = 'booking.reschedule' LIMIT 1`,
    })
    if (rescheduled.rows.length > 0) {
      throw new BookingError('TOKEN_ALREADY_CONSUMED', 409, 'Reschedule token has already been used')
    }
    throw new BookingError('INVALID_TOKEN', 403, 'Invalid reschedule token')
  }

  const resourceId = input.resourceId ?? row.resource_id
  const durationMin = row.total_duration_min
  const end = new Date(start.getTime() + durationMin * 60_000)

  try {
    return await db.drizzle.transaction(async (trx: any) => {
      // Serialize BOTH resources (ordered by id — deadlock-free).
      const lockIds = [...new Set([String(row.resource_id), String(resourceId)])].sort()
      for (const lockId of lockIds) {
        await trx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtext('resource_slot_lock_' || ${lockId}))`,
        )
      }

      const clash = await trx.execute(sql`
        SELECT 1 FROM slot_reservations
        WHERE resource_id = ${resourceId}
          AND id <> ${row.id}
          AND status IN ('HELD', 'BOOKED', 'PENDING_APPROVAL')
          AND tstzrange("start_time" - make_interval(mins => ${row.buffer_before_min}),
                         "end_time"   + make_interval(mins => ${row.buffer_after_min}))
              && tstzrange(${start.toISOString()}, ${end.toISOString()})
        LIMIT 1`)
      if (clash.rows.length > 0) {
        throw new BookingError('SLOT_TAKEN', 409, 'The new slot has just been taken')
      }

      // In-place atomic exchange: one row moves; the order (and any captured
      // payment) stays bound to it. The reminder re-arms for the new time.
      const cas = await trx.execute(sql`
        UPDATE slot_reservations
        SET resource_id = ${resourceId}, start_time = ${start.toISOString()}, end_time = ${end.toISOString()},
            schedule_version = schedule_version + 1, reschedule_token_hash = null, reminder_sent_at = null,
            updated_at = now()
        WHERE id = ${row.id} AND schedule_version = ${row.schedule_version}
        RETURNING schedule_version, status`)
      if (cas.rows.length === 0) {
        throw new BookingError('CONFLICT', 409, 'Booking changed concurrently, retry')
      }

      await trx.execute(sql`
        INSERT INTO audit_events (action, actor_id, aggregate_type, aggregate_id, metadata_json, created_at, updated_at)
        VALUES ('booking.reschedule', 'CUSTOMER', 'BOOKING', ${String(row.id)},
                ${JSON.stringify({ from: row.start_time, to: start.toISOString(), resourceId: String(resourceId) })}::jsonb, now(), now())`)

      const updated = cas.rows[0] as { schedule_version: number; status: string }
      return {
        status: updated.status,
        scheduleVersion: Number(updated.schedule_version),
        newStart: start.toISOString(),
      }
    })
  } catch (err: unknown) {
    if (err instanceof BookingError) throw err
    if (pgErrorCode(err) === '23P01') {
      throw new BookingError('SLOT_TAKEN', 409, 'The new slot has just been taken')
    }
    throw err
  }
}

export interface AcknowledgeResult {
  status: 'acknowledged'
  scheduleVersion: number
}

/** Reminder acknowledgement (spec 003 US3): CAS bump of scheduleVersion. */
export async function acknowledgeBooking(
  payload: Payload,
  accessToken: string,
): Promise<AcknowledgeResult> {
  const db: any = payload.db
  return await db.drizzle.transaction(async (trx: any) => {
    const rowRes = await trx.execute(sql`
      SELECT sr.id, sr.schedule_version
      FROM slot_reservations sr JOIN orders o ON o.id = sr.order_id
      WHERE o.access_token = ${accessToken} AND sr.status IN ('BOOKED', 'HELD', 'PENDING_APPROVAL', 'PAYMENT_PENDING')
      ORDER BY sr.id DESC LIMIT 1`)
    const row = rowRes.rows?.[0] as { id: number; schedule_version: number } | undefined
    if (!row) throw new BookingError('BOOKING_NOT_FOUND', 404, 'Active booking not found')

    const cas = await trx.execute(sql`
      UPDATE slot_reservations
      SET schedule_version = schedule_version + 1, updated_at = now()
      WHERE id = ${row.id} AND schedule_version = ${row.schedule_version}
      RETURNING schedule_version`)
    if (cas.rows.length === 0) {
      throw new BookingError('CONFLICT', 409, 'Booking changed concurrently, retry')
    }
    await trx.execute(sql`
      INSERT INTO audit_events (action, actor_id, aggregate_type, aggregate_id, metadata_json, created_at, updated_at)
      VALUES ('booking.acknowledged', 'CUSTOMER', 'BOOKING', ${String(row.id)}, '{}'::jsonb, now(), now())`)
    return { status: 'acknowledged' as const, scheduleVersion: Number(row.schedule_version) + 1 }
  })
}

// ---------------------------------------------------------------------------
// 004-telegram-bots: staff re-issue + client chat cancel seam
// ---------------------------------------------------------------------------

export interface IssueRescheduleTokenResult {
  reservationId: number
  rescheduleToken: string
  scheduleVersion: number
}

/**
 * Staff re-issue (spec 004 FR-403/D7): 003 issues the reschedule nonce exactly
 * once at booking time; when the link is lost/expired, staff mints a NEW nonce
 * (CAS bump + advisory lock + audit). The old link dies with the hash replace.
 */
export async function issueRescheduleToken(
  payload: Payload,
  input: { reservationId: string; actorId: string },
): Promise<IssueRescheduleTokenResult> {
  const nonce = randomUUID()
  const tokenHash = hashToken(nonce)
  const db: any = payload.db
  return await db.drizzle.transaction(async (trx: any) => {
    await trx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext('resource_slot_cancel_' || ${input.reservationId}))`,
    )
    const cas = await trx.execute(sql`
      UPDATE slot_reservations
      SET reschedule_token_hash = ${tokenHash}, schedule_version = schedule_version + 1, updated_at = now()
      WHERE id = ${input.reservationId} AND status IN ('BOOKED', 'HELD', 'PENDING_APPROVAL', 'PAYMENT_PENDING')
      RETURNING schedule_version`)
    if (cas.rows.length === 0) {
      throw new BookingError('BOOKING_NOT_ACTIVE', 422, 'Booking is not active')
    }
    await trx.execute(sql`
      INSERT INTO audit_events (action, actor_id, aggregate_type, aggregate_id, metadata_json, created_at, updated_at)
      VALUES ('booking.reschedule-token-issued', ${input.actorId}, 'BOOKING', ${input.reservationId}, '{}'::jsonb, now(), now())`)
    return {
      reservationId: Number(input.reservationId),
      rescheduleToken: nonce,
      scheduleVersion: Number((cas.rows[0] as { schedule_version: number }).schedule_version),
    }
  })
}

export interface CancelByClientChatInput {
  orderId: number
  chatId: string
  now?: Date
  gateway?: PaymentGateway
}

export interface CancelByClientChatResult {
  status: 'cancelled'
  reservationId: number
  scheduleVersion: number
  refund?: 'auto-refunded' | 'refund_requested' | 'refund_failed'
}

/**
 * Client decline via Telegram (spec 004 FR-403, review F3): `cancelBooking`
 * requires the raw one-time cancelToken (hash-only storage), which the bot
 * holding only (chatId, orderId) does not have. This seam authorizes via the
 * TgLink binding and reuses the SAME FSM + refund policy (003) under the hood.
 */
export async function cancelBookingByClientChat(
  payload: Payload,
  input: CancelByClientChatInput,
  gateway?: PaymentGateway,
): Promise<CancelByClientChatResult> {
  const db: any = payload.db

  // TgLink authorization: this chat must be bound to this order.
  const link = await db.execute({
    drizzle: db.drizzle,
    sql: sql`SELECT 1 FROM tg_links WHERE chat_id = ${input.chatId} AND order_id = ${input.orderId} LIMIT 1`,
  })
  if ((link.rows ?? []).length === 0) {
    throw new BookingError('LINK_NOT_FOUND', 403, 'This chat is not linked to the booking')
  }

  // Latest active reservation for the order.
  const rowRes = await db.execute({
    drizzle: db.drizzle,
    sql: sql`SELECT sr.id, sr.status, sr.schedule_version, sr.order_id, sr.resource_id, sr.item_id, sr.end_time,
                    o.status AS order_status, o.amount, o.stripe_payment_intent_ref AS stripe_payment_intent_id,
                    sr.start_time, COALESCE(p.cancellation_cutoff_hours, 3) AS cutoff_hours
             FROM slot_reservations sr
             JOIN orders o ON o.id = sr.order_id
             LEFT JOIN products p ON p.id::text = sr.item_id
             WHERE sr.order_id = ${input.orderId}
             ORDER BY sr.id DESC LIMIT 1`,
  })
  const row = rowRes.rows?.[0] as
    | {
        id: number
        status: string
        schedule_version: number
        order_id: number
        order_status: string
        amount: string | number
        stripe_payment_intent_id: string | null
        start_time: string
        end_time: string
        resource_id: string
        item_id: string | null
        cutoff_hours: number
      }
    | undefined
  if (!row) throw new BookingError('BOOKING_NOT_FOUND', 404, 'Booking not found')
  if (row.status === 'RELEASED') {
    throw new BookingError('BOOKING_NOT_ACTIVE', 422, 'Booking is already cancelled')
  }

  const now = input.now ?? new Date()
  const specState: BookingFsmState | null =
    DB_TO_SPEC_BOOKING_STATE[row.status as keyof typeof DB_TO_SPEC_BOOKING_STATE] ?? null
  if (!specState) throw new BookingError('FSM_REJECTED', 422, `Unmappable DB status ${row.status}`)
  const fsm = transitionBookingFsm(specState, 'CUSTOMER_CANCEL', { now })
  if (!fsm.ok) throw new BookingError('FSM_REJECTED', 422, fsm.reason)
  if (!fsm.effects.release) throw new BookingError('FSM_REJECTED', 422, 'cancel produced no release')

  const amountNum = Number(row.amount)
  const paid =
    row.order_status === 'completed' && Number.isFinite(amountNum) && amountNum > 0 && Boolean(row.stripe_payment_intent_id)
  const beforeCutoff = isBeforeCancellationCutoff({
    start: new Date(row.start_time),
    cancellationCutoffHours: row.cutoff_hours,
    now,
  })
  let refund: CancelByClientChatResult['refund']
  if (paid) refund = beforeCutoff ? 'auto-refunded' : 'refund_requested'

  await db.drizzle.transaction(async (trx: any) => {
    await trx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext('resource_slot_cancel_' || ${row.id}))`,
    )
    const cas = await trx.execute(sql`
      UPDATE slot_reservations
      SET status = 'RELEASED', schedule_version = schedule_version + 1, updated_at = now()
      WHERE id = ${row.id} AND schedule_version = ${row.schedule_version}
      RETURNING id`)
    if (cas.rows.length === 0) throw new BookingError('CONFLICT', 409, 'Booking changed concurrently, retry')
    await trx.execute(
      sql`UPDATE orders SET status = ${paid ? 'refund_requested' : 'cancelled'}, updated_at = now() WHERE id = ${row.order_id}`,
    )
    await trx.execute(sql`
      INSERT INTO audit_events (action, actor_id, aggregate_type, aggregate_id, metadata_json, created_at, updated_at)
      VALUES ('booking.cancel-by-telegram', 'CUSTOMER', 'BOOKING', ${String(row.id)},
              ${JSON.stringify({ chatId: input.chatId, refund: refund ?? 'not-applicable' })}::jsonb, now(), now())`)
  })

  // Waitlist: freed slot re-enters the queue (best-effort, spec 006 FR-602).
  try {
    await notifySlotFreed(payload, {
      resourceId: row.resource_id,
      productId: row.item_id as string,
      slotStart: new Date(row.start_time),
      slotEnd: new Date(row.end_time),
    })
  } catch (wlErr: unknown) {
    payload.logger.error({ err: wlErr, message: 'waitlist notifySlotFreed failed (tg-cancel continues)' })
  }

  // Refund after commit — same two-phase canon as cancelBooking (003).
  if (refund === 'auto-refunded') {
    const gw = gateway ?? stripeGateway
    try {
      await gw.createRefund({ paymentIntentId: row.stripe_payment_intent_id as string })
      await db.execute({
        drizzle: db.drizzle,
        sql: sql`UPDATE orders SET status = 'refunded', updated_at = now() WHERE id = ${row.order_id}`,
      })
    } catch {
      refund = 'refund_failed'
      await db.execute({
        drizzle: db.drizzle,
        sql: sql`UPDATE orders SET status = 'refund_failed', updated_at = now() WHERE id = ${row.order_id}`,
      })
    }
  }

  return { status: 'cancelled', reservationId: row.id, scheduleVersion: row.schedule_version + 1, refund }
}
