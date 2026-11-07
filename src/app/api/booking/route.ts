import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'

import configPromise from '@payload-config'

import { BookingError, createBooking } from '@/lib/booking/bookingService'
import { checkRateLimit, clientIpFrom } from '@/lib/security/rateLimiter'

/** Public booking endpoint (spec 002-booking-domain US5, FR-206). */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const ip = clientIpFrom(req)
  const rl = checkRateLimit(`booking:${ip}`)
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

  const productId = typeof body.productId === 'string' ? body.productId : null
  const start = typeof body.start === 'string' ? body.start : null
  const customerName = typeof body.customerName === 'string' ? body.customerName.trim() : ''
  const customerPhone = typeof body.customerPhone === 'string' ? body.customerPhone.trim() : ''
  const customerEmail = typeof body.customerEmail === 'string' ? body.customerEmail : undefined
  const resourceId = typeof body.resourceId === 'string' ? body.resourceId : undefined
  const idempotencyKey =
    typeof body.idempotencyKey === 'string' && body.idempotencyKey
      ? body.idempotencyKey
      : undefined
  // Spec 003 FR-301 (review F7): a client-supplied paymentMode is ignored by
  // design — the mode is read strictly from the Product server-side. The field
  // is intentionally NOT destructured here.

  if (!productId || !start || !customerName || !customerPhone) {
    return NextResponse.json(
      { error: 'VALIDATION_FAILED', required: ['productId', 'start', 'customerName', 'customerPhone'] },
      { status: 400 },
    )
  }
  if (customerName.length > 200 || customerPhone.length > 50) {
    return NextResponse.json({ error: 'VALIDATION_FAILED' }, { status: 400 })
  }

  const payload = await getPayload({ config: configPromise })

  try {
    const result = await createBooking(payload, {
      productId,
      resourceId,
      start,
      customerName,
      customerPhone,
      customerEmail: customerEmail || undefined,
      idempotencyKey,
    })
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
      { status: 201 },
    )
  } catch (err: unknown) {
    if (err instanceof BookingError) {
      return NextResponse.json({ error: err.code, message: err.message }, { status: err.status })
    }
    const pgCode = (err as { code?: string }).code
    if (pgCode === '23505') {
      return NextResponse.json({ error: 'DUPLICATE_IDEMPOTENCY_KEY' }, { status: 409 })
    }
    return NextResponse.json({ error: 'INTERNAL' }, { status: 500 })
  }
}
