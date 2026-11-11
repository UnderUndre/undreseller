import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import {
  computeOtpHash,
  generateOtpCode,
  OTP_TTL_MIN,
  verifyOtpCode,
} from '@/lib/booking/otp'
import {
  BookingError,
  createBooking,
  findBookingByIdempotencyKey,
  type BookingResult,
} from '@/lib/booking/bookingService'
import { isBlacklisted } from '@/lib/telegram/blacklist'
import { resolveAvailability } from '@/lib/availability/resolver'
import { checkRateLimit } from '@/lib/security/rateLimiter'

/**
 * BookingIntent service (spec 007-booking-trust-gate, research D1–D4): all
 * writes to `booking_intents` live here. The intent is NOT a booking — it
 * holds no slot and never touches the FSM; it is the email-ownership gate in
 * front of `createBooking` (which stays the ONLY status writer).
 *
 * Error catalog (tasks Notes): INTENT_CAP / INTENT_DEAD / OTP_INVALID /
 * BLACKLISTED — mapped 1:1 to HTTP by the booking routes.
 */

export class IntentError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
    public readonly retryAfterSec?: number,
  ) {
    super(message)
  }
}

export const INTENT_TTL_MIN = OTP_TTL_MIN // 10m code lifetime = intent lifetime
const LIVE_CAP_PER_EMAIL = 2 // FR-701: ≤ 2 live (pending) intents per email
/** Composite rate limit (review F3): INDEPENDENT buckets per IP and per email. */
const RL_IP_MAX = 10
const RL_EMAIL_MAX = 3
const RL_WINDOW_MS = 10 * 60_000
/** Resend cap on an existing pending intent (review F2). */
const RESEND_MAX_PER_INTENT = 3

export interface CreateIntentInput {
  productId: string
  start: string
  customerName: string
  customerPhone: string
  customerEmail: string
  resourceId?: string | number
  ip: string
  now?: Date
}

export interface CreateIntentResult {
  intentId: number
  expiresAt: string
  /** False when Resend rejected/failed — the client retries via the resend endpoint (F2). */
  emailSent: boolean
}

/**
 * Phase 1 (FR-702): validate (future + grid by the computeSlots canon) →
 * composite rate limit (F3) → cap ≤ 2 live/email (advisory canon) → insert
 * pending intent with a context-bound HMAC (F6) → OTP email (best-effort —
 * a failed email NEVER fails the intent; recovery is the resend endpoint).
 */
export async function createIntent(payload: Payload, input: CreateIntentInput): Promise<CreateIntentResult> {
  const now = input.now ?? new Date()
  const start = new Date(input.start)
  if (!input.customerEmail || !input.customerEmail.includes('@')) {
    throw new IntentError('VALIDATION_FAILED', 400, 'customerEmail is required for the OTP flow')
  }
  if (!input.customerName || !input.customerPhone) {
    throw new IntentError('VALIDATION_FAILED', 400, 'customerName and customerPhone are required')
  }
  if (input.customerName.length > 200 || input.customerPhone.length > 50) {
    throw new IntentError('VALIDATION_FAILED', 400, 'customerName/customerPhone exceed length limits')
  }
  if (Number.isNaN(start.getTime()) || start.getTime() <= now.getTime()) {
    throw new IntentError('SLOT_IN_PAST', 422, 'Booking start must be in the future')
  }

  // Blacklist (error catalog): blocked phone never enters the intent flow.
  if (await isBlacklisted(payload, { phone: input.customerPhone })) {
    throw new IntentError('BLACKLISTED', 403, 'This phone is not allowed to book')
  }

  // Composite rate limit (F3): two INDEPENDENT buckets — per-IP caps intent
  // spam from one host, per-email caps distributed attacks on one address.
  const rlIp = checkRateLimit(`booking-intent-ip:${input.ip}`, RL_IP_MAX, RL_WINDOW_MS, now.getTime())
  const rlEmail = checkRateLimit(`booking-intent-email:${input.customerEmail}`, RL_EMAIL_MAX, RL_WINDOW_MS, now.getTime())
  const denied = !rlIp.allowed ? rlIp : !rlEmail.allowed ? rlEmail : null
  if (denied) {
    throw new IntentError('RATE_LIMITED', 429, 'Too many verification requests', denied.retryAfterSec)
  }

  // Grid validation (D3, computeSlots canon): the intent is created ONLY on a
  // real computed slot of the resolved resource — past slots are filtered
  // inside resolveAvailability, junk times are rejected here.
  const date = start.toISOString().slice(0, 10)
  const grid = await resolveAvailability(payload, { productId: input.productId, date, resourceId: input.resourceId ? String(input.resourceId) : undefined, now })
  if (!grid.ok) {
    if (grid.code === 'SERVICE_NOT_FOUND') throw new IntentError('SERVICE_NOT_FOUND', 404, 'Service not found')
    if (grid.code === 'SERVICE_NOT_BOOKABLE') throw new IntentError('SERVICE_NOT_BOOKABLE', 422, 'Service is not bookable')
    throw new IntentError('RESOURCE_NOT_FOUND', 422, 'No active booking resource')
  }
  const slot = grid.slots.find((s) => s.start === start.toISOString())
  if (!slot) {
    throw new IntentError('SLOT_NOT_AVAILABLE', 422, 'The requested time is not an available slot')
  }

  const product = (await payload
    .findByID({ collection: 'products', id: input.productId, overrideAccess: true, depth: 0 })
    .catch(() => null)) as unknown as { title?: string; durationMin?: number; deletedAt?: string | null } | null
  if (!product || product.deletedAt) {
    throw new IntentError('SERVICE_NOT_FOUND', 404, 'Service not found')
  }
  const durationMin = product.durationMin
  if (typeof durationMin !== 'number' || durationMin < 5) {
    throw new IntentError('SERVICE_NOT_BOOKABLE', 422, 'Service is missing durationMin')
  }
  const slotEnd = new Date(start.getTime() + durationMin * 60_000)

  const code = generateOtpCode()
  const expiresAt = new Date(now.getTime() + INTENT_TTL_MIN * 60_000)

  const db: any = payload.db
  let intentId: number
  let storedExpiresAt: string
  await db.drizzle.transaction(async (trx: any) => {
    // Race-safe cap — hashtext canon (004 F6 lesson).
    await trx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('booking_intent_' || ${input.customerEmail}))`)
    const cap = await trx.execute(sql`
      SELECT count(*) AS n FROM booking_intents
      WHERE email = ${input.customerEmail} AND status = 'pending'`)
    if (Number((cap.rows[0] as { n: number }).n) >= LIVE_CAP_PER_EMAIL) {
      throw new IntentError('INTENT_CAP', 429, `Max ${LIVE_CAP_PER_EMAIL} live verification requests per email`)
    }

    const inserted = await trx.execute(sql`
      INSERT INTO booking_intents
        (email, customer_name, customer_phone, service_id_id, resource_id_id,
         slot_start, slot_end, code_hash, expires_at, attempts, status, created_at, updated_at)
      VALUES (${input.customerEmail}, ${input.customerName}, ${input.customerPhone},
              ${input.productId}::numeric, ${grid.resourceId}::numeric,
              ${start.toISOString()}, ${slotEnd.toISOString()},
              ${computeOtpHash(0, input.customerEmail, code)}, ${expiresAt.toISOString()},
              0, 'pending', now(), now())
      RETURNING id, expires_at`)
    const row = inserted.rows[0] as { id: number; expires_at: string }
    intentId = Number(row.id)
    storedExpiresAt = new Date(row.expires_at).toISOString()

    // The HMAC context binding (F6) needs the REAL intentId — recompute the
    // digest for the inserted row (the 0 above is a placeholder).
    await trx.execute(sql`
      UPDATE booking_intents SET code_hash = ${computeOtpHash(intentId, input.customerEmail, code)}
      WHERE id = ${intentId}`)

    await trx.execute(sql`
      INSERT INTO audit_events (action, actor_id, aggregate_type, aggregate_id, metadata_json, created_at, updated_at)
      VALUES ('intent.created', 'CUSTOMER', 'INTENT', ${String(intentId)},
              ${JSON.stringify({ serviceId: input.productId, resourceId: grid.resourceId })}::jsonb, now(), now())`)
  })

  const emailSent = await sendOtpEmail(payload, {
    email: input.customerEmail,
    code,
    serviceName: product.title?.trim() || 'Запись',
    startTime: start.toISOString(),
  })

  return { intentId: intentId!, expiresAt: storedExpiresAt!, emailSent }
}

export interface ResendIntentInput {
  intentId: string
  now?: Date
}

export interface ResendIntentResult {
  intentId: number
  expiresAt: string
  emailSent: boolean
}

/**
 * Resend (review F2): rotates codeHash + refreshes expiresAt on the EXISTING
 * pending intent (no duplicates), ≤ 3 / 10 min per intent. Rejected codes and
 * attempt counters carry over — resend never weakens the brute-force gate.
 */
export async function resendIntent(payload: Payload, input: ResendIntentInput): Promise<ResendIntentResult> {
  const now = input.now ?? new Date()
  const db: any = payload.db
  const intentId = Number(input.intentId)
  if (!Number.isInteger(intentId) || intentId <= 0) {
    throw new IntentError('INTENT_NOT_FOUND', 404, 'Intent not found')
  }

  const rl = checkRateLimit(`booking-intent-resend:${intentId}`, RESEND_MAX_PER_INTENT, RL_WINDOW_MS, now.getTime())
  if (!rl.allowed) {
    throw new IntentError('RATE_LIMITED', 429, 'Too many resend attempts', rl.retryAfterSec)
  }

  const rowRes = await db.execute({
    drizzle: db.drizzle,
    sql: sql`SELECT id, email, status, service_id_id AS service_id, slot_start
             FROM booking_intents WHERE id = ${intentId} LIMIT 1`,
  })
  const row = rowRes.rows?.[0] as
    | { id: number; email: string; status: string; service_id: string | number; slot_start: string }
    | undefined
  if (!row) throw new IntentError('INTENT_NOT_FOUND', 404, 'Intent not found')
  if (row.status === 'consumed') {
    throw new IntentError('INTENT_CONSUMED', 409, 'This verification request is already completed')
  }
  if (row.status !== 'pending') {
    throw new IntentError('INTENT_DEAD', 403, 'This verification request is no longer active')
  }

  const product = (await payload
    .findByID({ collection: 'products', id: String(row.service_id), overrideAccess: true, depth: 0 })
    .catch(() => null)) as unknown as { title?: string } | null

  const code = generateOtpCode()
  const expiresAt = new Date(now.getTime() + INTENT_TTL_MIN * 60_000)
  const cas = await db.execute({
    drizzle: db.drizzle,
    sql: sql`UPDATE booking_intents
             SET code_hash = ${computeOtpHash(intentId, row.email, code)}, expires_at = ${expiresAt.toISOString()}, updated_at = now()
             WHERE id = ${intentId} AND status = 'pending'
             RETURNING expires_at`,
  })
  if ((cas.rows ?? []).length === 0) {
    // The sweep or a concurrent consume won the race — the intent is gone.
    throw new IntentError('INTENT_DEAD', 403, 'This verification request is no longer active')
  }

  const emailSent = await sendOtpEmail(payload, {
    email: row.email,
    code,
    serviceName: product?.title?.trim() || 'Запись',
    startTime: new Date(row.slot_start).toISOString(),
  })
  return { intentId, expiresAt: new Date((cas.rows[0] as { expires_at: string }).expires_at).toISOString(), emailSent }
}

export interface VerifyIntentInput {
  intentId: string
  otp: string
  now?: Date
  /** Gateway seam for tests — NEVER part of the public route contract. */
  gateway?: import('@/lib/payments/stripeGateway').PaymentGateway
}

export interface VerifyIntentResult {
  booking: BookingResult
  /** True when the intent was already consumed and the existing booking was returned (F4 idempotent repeat). */
  replayed: boolean
  /** The verified email — the route mints the trust cookie against it (F1). */
  email: string
}

/**
 * Phase 2 (FR-702, Risk 20): attempts gate (≤5 → dead) → timing-safe OTP
 * verify → hydrate booking params STRICTLY from the DB intent (review F5 —
 * the request body beyond intentId/otp is ignored by construction) →
 * createBooking under a deterministic idempotencyKey → CAS consumed strictly
 * AFTER the booking succeeded (review F4). Slot taken → honest 409 + dead
 * intent (never re-armed). A replay of a consumed intent returns the existing
 * booking by the idempotency key.
 */
export async function verifyIntentBooking(payload: Payload, input: VerifyIntentInput): Promise<VerifyIntentResult> {
  const now = input.now ?? new Date()
  const db: any = payload.db
  const intentId = Number(input.intentId)
  if (!Number.isInteger(intentId) || intentId <= 0) {
    throw new IntentError('INTENT_NOT_FOUND', 404, 'Intent not found')
  }

  const rowRes = await db.execute({
    drizzle: db.drizzle,
    sql: sql`SELECT id, email, customer_name, customer_phone, service_id_id AS service_id,
                    resource_id_id AS resource_id, slot_start, code_hash, expires_at, attempts, status
             FROM booking_intents WHERE id = ${intentId} LIMIT 1`,
  })
  const intent = rowRes.rows?.[0] as
    | {
        id: number
        email: string
        customer_name: string
        customer_phone: string
        service_id: string | number
        resource_id: string | number
        slot_start: string
        code_hash: string
        expires_at: string
        attempts: number
        status: string
      }
    | undefined
  if (!intent) throw new IntentError('INTENT_NOT_FOUND', 404, 'Intent not found')

  if (intent.status === 'dead' || intent.status === 'expired') {
    throw new IntentError('INTENT_DEAD', 403, 'This verification request is no longer active')
  }

  if (intent.status === 'consumed') {
    // F4 idempotent repeat: verify ownership again (a replay must not leak the
    // booking tokens to an attacker who only knows intentId), then return the
    // existing booking.
    if (!verifyOtpCode(intent.id, intent.email, input.otp, intent.code_hash)) {
      throw new IntentError('OTP_INVALID', 403, 'Invalid verification code')
    }
    const existing = await findBookingByIdempotencyKey(payload, `booking-intent-${intent.id}`)
    if (!existing) throw new IntentError('INTENT_DEAD', 403, 'This verification request is no longer active')
    return { booking: existing, replayed: true, email: intent.email }
  }

  // pending
  if (Number(intent.attempts) >= 5) {
    throw new IntentError('INTENT_DEAD', 403, 'Too many invalid code attempts')
  }
  if (new Date(intent.expires_at).getTime() <= now.getTime()) {
    throw new IntentError('INTENT_DEAD', 403, 'The verification code has expired')
  }

  if (!verifyOtpCode(intent.id, intent.email, input.otp, intent.code_hash)) {
    const bumped = await db.execute({
      drizzle: db.drizzle,
      sql: sql`UPDATE booking_intents SET attempts = attempts + 1, updated_at = now()
               WHERE id = ${intent.id} AND status = 'pending'
               RETURNING attempts`,
    })
    const attempts = Number((bumped.rows?.[0] as { attempts: number } | undefined)?.attempts ?? 0)
    if (attempts >= 5) {
      const dead = await db.execute({
        drizzle: db.drizzle,
        sql: sql`UPDATE booking_intents SET status = 'dead', updated_at = now()
                 WHERE id = ${intent.id} AND status = 'pending'`,
      })
      if ((dead.rowCount ?? 0) > 0) {
        await db.execute({
          drizzle: db.drizzle,
          sql: sql`INSERT INTO audit_events (action, actor_id, aggregate_type, aggregate_id, metadata_json, created_at, updated_at)
                   VALUES ('intent.dead', 'SYSTEM', 'INTENT', ${String(intent.id)},
                           ${JSON.stringify({ reason: 'ATTEMPTS_EXHAUSTED' })}::jsonb, now(), now())`,
        })
      }
    }
    throw new IntentError('OTP_INVALID', 403, 'Invalid verification code')
  }

  // F5: EVERY booking parameter comes from the DB intent — the request body is
  // structurally incapable of injecting slot/product/customer data here.
  const { BookingError: BookingErr } = await import('@/lib/booking/bookingService')
  let booking: BookingResult
  try {
    booking = await createBooking(payload, {
      productId: String(intent.service_id),
      resourceId: intent.resource_id,
      start: new Date(intent.slot_start).toISOString(),
      customerName: intent.customer_name,
      customerPhone: intent.customer_phone,
      customerEmail: intent.email,
      idempotencyKey: `booking-intent-${intent.id}`,
      now,
      gateway: input.gateway,
    })
  } catch (err: unknown) {
    if (err instanceof BookingErr && err.code === 'SLOT_TAKEN') {
      // STM seam: a concurrent verify of the SAME intent may have just
      // committed the booking under the SAME idempotency key — createBooking's
      // clash-check fires before its own 23505 fallback, so re-check HERE
      // before declaring the slot taken. No booking → a REAL take: honest 409
      // and the intent dies (never re-armed).
      const existing = await findBookingByIdempotencyKey(payload, `booking-intent-${intent.id}`)
      if (!existing) {
        const dead = await db.execute({
          drizzle: db.drizzle,
          sql: sql`UPDATE booking_intents SET status = 'dead', updated_at = now()
                   WHERE id = ${intent.id} AND status = 'pending'`,
        })
        if ((dead.rowCount ?? 0) > 0) {
          await db.execute({
            drizzle: db.drizzle,
            sql: sql`INSERT INTO audit_events (action, actor_id, aggregate_type, aggregate_id, metadata_json, created_at, updated_at)
                     VALUES ('intent.dead', 'SYSTEM', 'INTENT', ${String(intent.id)},
                             ${JSON.stringify({ reason: 'SLOT_TAKEN' })}::jsonb, now(), now())`,
          })
        }
        throw err
      }
      booking = existing
    } else {
      throw err
    }
  }

  // F4: CAS consumed strictly AFTER createBooking success. 0 rows = a
  // concurrent verify of the SAME intent already consumed it — both callers
  // hold the SAME idempotent booking, exactly one row exists (STM-тест).
  const cas = await db.execute({
    drizzle: db.drizzle,
    sql: sql`UPDATE booking_intents SET status = 'consumed', updated_at = now()
             WHERE id = ${intent.id} AND status = 'pending'`,
  })
  if ((cas.rowCount ?? 0) > 0) {
    await db.execute({
      drizzle: db.drizzle,
      sql: sql`INSERT INTO audit_events (action, actor_id, aggregate_type, aggregate_id, metadata_json, created_at, updated_at)
               VALUES ('intent.consumed', 'CUSTOMER', 'INTENT', ${String(intent.id)},
                       ${JSON.stringify({ reservationId: booking.reservationId })}::jsonb, now(), now())`,
    })
  }
  return { booking, replayed: false, email: intent.email }
}

/**
 * OTP email (T711): code + service + slot + TTL warning, NOTHING else — no
 * name, no phone (NFR-704 PII). Best-effort: a failure is logged to the
 * delivery log and reported via `emailSent: false`; the client recovers via
 * the resend endpoint (F2). The plaintext code never lands in a job input or
 * the DB — it exists only in this call frame and the email itself (audit C1).
 */
async function sendOtpEmail(
  payload: Payload,
  input: { email: string; code: string; serviceName: string; startTime: string },
): Promise<boolean> {
  const { sendEmail, logDelivery } = await import('@/lib/email/resendAdapter')
  const { otpEmail } = await import('@/lib/email/templates')
  const message = otpEmail({
    code: input.code,
    serviceName: input.serviceName,
    startTime: input.startTime,
    ttlMin: INTENT_TTL_MIN,
  })
  try {
    await sendEmail(payload, { to: input.email, subject: message.subject, html: message.html })
    await logDelivery(payload, { kind: 'intent', status: 'sent', email: input.email })
    return true
  } catch (err: unknown) {
    await logDelivery(payload, {
      kind: 'intent',
      status: 'failed',
      email: input.email,
      errorDetail: err instanceof Error ? err.name : 'UNKNOWN',
    })
    return false
  }
}
