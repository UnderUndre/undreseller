import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'
import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import {
  transitionBookingFsm,
  DB_TO_SPEC_BOOKING_STATE,
  type BookingFsmState,
} from '@/lib/kernel/bookingFsm'

/**
 * Booking domain service (spec 002-booking-domain US5/US6, research D4):
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
}

export interface BookingResult {
  reservationId: number
  orderId: number
  accessToken: string
  cancelToken: string
  status: string
  scheduleVersion: number
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

async function findExistingByIdempotencyKey(
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
    status: row.status,
    scheduleVersion: Number(row.schedule_version),
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
    const existing = await findExistingByIdempotencyKey(payload, input.idempotencyKey)
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

  const db: any = payload.db
  try {
    return await db.drizzle.transaction(async (trx: any) => {
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
        track: 'FREE',
        requiresApproval,
      })
      if (!fsm.ok) {
        throw new BookingError('FSM_REJECTED', 422, fsm.reason)
      }
      const dbStatus = { CONFIRMED: 'BOOKED', PENDING_APPROVAL: 'PENDING_APPROVAL' }[
        fsm.state as 'CONFIRMED' | 'PENDING_APPROVAL'
      ]

      const order = await trx.execute(sql`
        INSERT INTO orders (customer_email, status, amount, currency, access_token, created_at, updated_at)
        VALUES (${input.customerEmail ?? null}, 'processing', 0, 'USD', ${accessToken}, now(), now())
        RETURNING id`)

      const orderId = (order.rows[0] as { id: number }).id

      const reservation = await trx.execute(sql`
        INSERT INTO slot_reservations
          (order_id, resource_id, item_id, start_time, end_time, total_duration_min,
           status, schedule_version, hold_expires_at, hold_frozen_at,
           buffer_before_min, buffer_after_min,
           customer_name, customer_phone, idempotency_key, cancel_token_hash,
           created_at, updated_at)
        VALUES
          (${orderId}, ${resourceId}, ${input.productId}, ${start.toISOString()}, ${end.toISOString()},
           ${durationMin}, ${dbStatus}, 1, null, null,
           ${bufferBeforeMin}, ${bufferAfterMin},
           ${input.customerName}, ${input.customerPhone}, ${input.idempotencyKey ?? null},
           ${cancelTokenHash}, now(), now())
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
        status: dbStatus,
        scheduleVersion: Number(row.schedule_version),
      }
    })
  } catch (err: unknown) {
    if (err instanceof BookingError) throw err
    const pgCode = pgErrorCode(err)
    if (pgCode === '23P01') {
      // GiST exclusion backstop fired — another transaction won the slot.
      throw new BookingError('SLOT_TAKEN', 409, 'The slot has just been taken')
    }
    if (pgCode === '23505' && input.idempotencyKey) {
      const existing = await findExistingByIdempotencyKey(payload, input.idempotencyKey)
      if (existing) return existing
    }
    throw err
  }
}

export interface CancelBookingResult {
  status: 'cancelled' | 'already_cancelled'
  scheduleVersion: number
}

export async function cancelBooking(
  payload: Payload,
  reservationId: string,
  cancelToken: string,
  now = new Date(),
): Promise<CancelBookingResult> {
  const db: any = payload.db
  const rowRes = await db.execute({
    drizzle: db.drizzle,
    sql: sql`SELECT id, status, schedule_version, order_id, cancel_token_hash
             FROM slot_reservations WHERE id = ${reservationId} LIMIT 1`,
  })
  const row = rowRes.rows?.[0] as
    | { id: number; status: string; schedule_version: number; order_id: number; cancel_token_hash: string | null }
    | undefined
  if (!row) throw new BookingError('BOOKING_NOT_FOUND', 404, 'Booking not found')

  if (!timingSafeHexMatch(sha256Hex(cancelToken), row.cancel_token_hash)) {
    throw new BookingError('INVALID_TOKEN', 403, 'Invalid cancel token')
  }

  if (row.status === 'RELEASED') {
    return { status: 'already_cancelled', scheduleVersion: Number(row.schedule_version) }
  }

  const specState: BookingFsmState | null = DB_TO_SPEC_BOOKING_STATE[row.status as keyof typeof DB_TO_SPEC_BOOKING_STATE] ?? null
  if (!specState) {
    throw new BookingError('FSM_REJECTED', 422, `Unmappable DB status ${row.status}`)
  }

  const fsm = transitionBookingFsm(specState, 'CUSTOMER_CANCEL', { now })
  if (!fsm.ok) throw new BookingError('FSM_REJECTED', 422, fsm.reason)
  if (!fsm.effects.release) throw new BookingError('FSM_REJECTED', 422, 'cancel produced no release')

  return await db.drizzle.transaction(async (trx: any) => {
    await trx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext('resource_slot_cancel_' || ${row.id}))`,
    )
    const cas = await trx.execute(sql`
      UPDATE slot_reservations
      SET status = 'RELEASED', schedule_version = schedule_version + 1, updated_at = now()
      WHERE id = ${row.id} AND schedule_version = ${row.schedule_version}
      RETURNING schedule_version`)
    if (cas.rows.length === 0) {
      return { status: 'already_cancelled' as const, scheduleVersion: row.schedule_version }
    }
    await trx.execute(
      sql`UPDATE orders SET status = 'cancelled', updated_at = now() WHERE id = ${row.order_id}`,
    )
    await trx.execute(sql`
      INSERT INTO audit_events (action, actor_id, aggregate_type, aggregate_id, metadata_json, created_at, updated_at)
      VALUES ('booking.cancel', 'CUSTOMER', 'BOOKING', ${String(row.id)},
              ${JSON.stringify({ via: 'cancel-endpoint' })}::jsonb, now(), now())`)
    return { status: 'cancelled', scheduleVersion: Number(row.schedule_version) + 1 }
  })
}

export type ApprovalAction = 'approve' | 'reject'

export type ApprovalResult =
  | { status: 'approved' | 'rejected' | 'ALREADY_PROCESSED'; scheduleVersion: number }

/** OPERATOR approve/reject via FSM CAS (spec 002-booking-domain US6, research D4). */
export async function approveBooking(
  payload: Payload,
  input: { reservationId: string; action: ApprovalAction; actorId: string },
): Promise<ApprovalResult> {
  const db: any = payload.db
  try {
    return await db.drizzle.transaction(async (trx: any) => {
      const rowRes = await trx.execute(sql`
        SELECT id, status, schedule_version, order_id, resource_id
        FROM slot_reservations WHERE id = ${input.reservationId} FOR UPDATE`)
      const row = rowRes.rows?.[0] as
        | { id: string; status: string; schedule_version: number; order_id: number; resource_id: string }
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
      }
    })
  } catch (err: unknown) {
    if (err instanceof BookingError) throw err
    const pgCode = pgErrorCode(err)
    if (pgCode === '23P01') throw new BookingError('SLOT_TAKEN', 409, 'Slot re-booked during approval')
    throw err
  }
}
