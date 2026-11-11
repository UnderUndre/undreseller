import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'

import configPromise from '@payload-config'

import { BookingError, createBooking } from '@/lib/booking/bookingService'
import { hashToken } from '@/lib/booking/tokens'
import { resolveAvailability } from '@/lib/availability/resolver'
import {
  createIntent,
  IntentError,
  verifyIntentBooking,
} from '@/lib/booking/intentService'
import {
  computeTrustToken,
  trustCookieAttributes,
  TRUST_COOKIE_NAME,
  verifyTrustToken,
} from '@/lib/booking/trustCookie'
import { isBlacklisted } from '@/lib/telegram/blacklist'
import { auditHoneypotHit, honeypotFilled } from '@/lib/security/honeypot'
import { checkRateLimit, clientIpFrom } from '@/lib/security/rateLimiter'

/**
 * Public booking endpoint, two-phase trust gate (spec 007 FR-702, research D3):
 * - no intentId  → phase 1: validate + composite RL (F3) → BookingIntent + OTP
 *   email → 202. A valid trust cookie for the SAME email skips the OTP phase
 *   entirely (F1) → direct 201.
 * - intentId+otp → phase 2: verify (attempts ≤ 5 → dead) → ALL booking params
 *   hydrate from the DB intent (F5) → createBooking → CAS consumed after
 *   success (F4) → 201 + trust cookie mint.
 * - intentId without otp → 400 (resend has its own endpoint).
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const ip = clientIpFrom(req)
  const rl = checkRateLimit(ip ? `booking:${ip}` : null)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'RATE_LIMITED', retryAfterSec: rl.retryAfterSec },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    )
  }

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 })
  }

  const payload = await getPayload({ config: configPromise })

  // Honeypot (FR-703): a filled hidden field = bot → silent 200, zero effects.
  if (honeypotFilled(body)) {
    await auditHoneypotHit(payload, 'booking')
    return NextResponse.json({ ok: true }, { status: 200 })
  }

  const productId = typeof body.productId === 'string' ? body.productId : null
  const start = typeof body.start === 'string' ? body.start : null
  const customerName = typeof body.customerName === 'string' ? body.customerName.trim() : ''
  const customerPhone = typeof body.customerPhone === 'string' ? body.customerPhone.trim() : ''
  const customerEmail = typeof body.customerEmail === 'string' ? body.customerEmail.trim() : ''
  const resourceId = typeof body.resourceId === 'string' ? body.resourceId : undefined
  const intentId = typeof body.intentId === 'string' ? body.intentId : null
  const otp = typeof body.otp === 'string' ? body.otp : null
  // 008 T812 (F-BE-02): a client-supplied idempotencyKey is IGNORED — the key
  // is server-derived (verified email + product + start) so that sequential or
  // guessed keys can never resolve another customer's booking. Spec 003
  // FR-301 (review F7) still holds: paymentMode is equally unread.
  void body.idempotencyKey
  // Spec 003 FR-301 (review F7) still holds: a client-supplied paymentMode is
  // ignored by design. In phase 2 EVERY param comes from the DB intent (F5) —
  // nothing in this body can influence the booked slot or customer data.

  // ---- Phase 2: intentId + otp -------------------------------------------
  if (intentId) {
    if (!otp) {
      return NextResponse.json(
        { error: 'VALIDATION_FAILED', required: ['otp'], hint: 'POST /api/booking/resend for a new code' },
        { status: 400 },
      )
    }
    try {
      const result = await verifyIntentBooking(payload, { intentId, otp })
      const res = bookingResponse(result.booking, 201)
      // F1: mint the trust cookie on a verified booking (both fresh and
      // replayed — the replay re-proved email ownership above).
      res.cookies.set(TRUST_COOKIE_NAME, computeTrustToken(result.email), trustCookieAttributes())
      return res
    } catch (err: unknown) {
      return errorResponse(err)
    }
  }

  // ---- Phase 1: no intentId ----------------------------------------------
  if (!productId || !start || !customerName || !customerPhone || !customerEmail) {
    return NextResponse.json(
      {
        error: 'VALIDATION_FAILED',
        required: ['productId', 'start', 'customerName', 'customerPhone', 'customerEmail'],
      },
      { status: 400 },
    )
  }
  if (customerName.length > 200 || customerPhone.length > 50) {
    return NextResponse.json({ error: 'VALIDATION_FAILED' }, { status: 400 })
  }

  // F1 trust cookie: valid cookie for the SAME email → skip the OTP phase.
  // A valid cookie authorizes ONLY its own email — mismatch → OTP flow.
  const trust = verifyTrustToken(req.cookies.get(TRUST_COOKIE_NAME)?.value)
  if (trust && trust.email === customerEmail) {
    try {
      if (await isBlacklisted(payload, { phone: customerPhone })) {
        return NextResponse.json({ error: 'BLACKLISTED', message: 'This phone is not allowed to book' }, { status: 403 })
      }
      // 008 T821 (SEC-A-08): Grid validation on the trust-cookie fast path too!
      // Arbitrary/unverified slots or non-active resources cannot bypass the grid.
      const startIso = new Date(start).toISOString()
      const date = startIso.slice(0, 10)
      const grid = await resolveAvailability(payload, {
        productId,
        date,
        resourceId: resourceId ? String(resourceId) : undefined,
        now: new Date(),
      })
      if (!grid.ok) {
        if (grid.code === 'SERVICE_NOT_FOUND') return NextResponse.json({ error: 'SERVICE_NOT_FOUND' }, { status: 404 })
        if (grid.code === 'SERVICE_NOT_BOOKABLE') return NextResponse.json({ error: 'SERVICE_NOT_BOOKABLE' }, { status: 422 })
        return NextResponse.json({ error: 'RESOURCE_NOT_FOUND' }, { status: 422 })
      }
      const slot = grid.slots.find((s) => s.start === startIso)
      if (!slot) {
        return NextResponse.json({ error: 'SLOT_NOT_AVAILABLE', message: 'The requested time is not an available slot' }, { status: 422 })
      }

      // 008 T812 (F-BE-02): deterministic SERVER-derived idempotency key —
      // a repeat of the same (email, service, slot) is an idempotent re-book,
      // anything else is a fresh booking.
      const serverIdempotencyKey = hashToken(`booking-idem:${customerEmail}:${productId}:${startIso}`)
      const result = await createBooking(payload, {
        productId,
        resourceId: grid.resourceId,
        start,
        customerName,
        customerPhone,
        customerEmail,
        idempotencyKey: serverIdempotencyKey,
      })
      const res = bookingResponse(result, 201)
      // Sliding window: every verified booking re-issues the cookie (F1).
      res.cookies.set(TRUST_COOKIE_NAME, computeTrustToken(customerEmail), trustCookieAttributes())
      return res
    } catch (err: unknown) {
      return errorResponse(err)
    }
  }

  // OTP path: create the intent (composite RL F3 + future/grid guard + cap
  // live intents per email live inside the service).
  try {
    const intent = await createIntent(payload, {
      productId,
      start,
      customerName,
      customerPhone,
      customerEmail,
      resourceId,
      ip: ip!,
    })
    return NextResponse.json(
      {
        intentId: String(intent.intentId),
        expiresAt: intent.expiresAt,
        emailSent: intent.emailSent,
      },
      { status: 202 },
    )
  } catch (err: unknown) {
    return errorResponse(err)
  }
}

function bookingResponse(
  result: Awaited<ReturnType<typeof createBooking>>,
  status: number,
): NextResponse {
  return NextResponse.json(
    {
      reservationId: result.reservationId,
      orderId: result.orderId,
      accessToken: result.accessToken,
      cancelToken: result.cancelToken,
      rescheduleToken: result.rescheduleToken,
      status: result.status,
      scheduleVersion: result.scheduleVersion,
      payment: {
        mode: result.paymentMode,
        paymentIntentId: result.paymentIntentId ?? null,
        clientSecret: result.clientSecret ?? null,
      },
    },
    { status },
  )
}

function errorResponse(err: unknown): NextResponse {
  if (err instanceof IntentError) {
    const headers = err.retryAfterSec ? { 'Retry-After': String(err.retryAfterSec) } : undefined
    return NextResponse.json(
      { error: err.code, message: err.message, ...(err.retryAfterSec ? { retryAfterSec: err.retryAfterSec } : {}) },
      { status: err.status, headers },
    )
  }
  if (err instanceof BookingError) {
    return NextResponse.json({ error: err.code, message: err.message }, { status: err.status })
  }
  const pgCode = (err as { code?: string }).code
  if (pgCode === '23505') {
    return NextResponse.json({ error: 'DUPLICATE_IDEMPOTENCY_KEY' }, { status: 409 })
  }
  return NextResponse.json({ error: 'INTERNAL' }, { status: 500 })
}
