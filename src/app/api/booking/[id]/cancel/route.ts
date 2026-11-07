import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'

import configPromise from '@payload-config'

import { BookingError, cancelBooking } from '@/lib/booking/bookingService'
import { checkRateLimit, clientIpFrom } from '@/lib/security/rateLimiter'

/** Customer cancel by one-time cancelToken (spec 002-booking-domain US5 AC5, FR-206). */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ip = clientIpFrom(req)
  const rl = checkRateLimit(`booking-cancel:${ip}`)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'RATE_LIMITED', retryAfterSec: rl.retryAfterSec },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    )
  }

  const { id } = await context.params
  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 })
  }
  const cancelToken = typeof body.cancelToken === 'string' ? body.cancelToken : null
  if (!cancelToken) {
    return NextResponse.json({ error: 'cancelToken required' }, { status: 400 })
  }

  const payload = await getPayload({ config: configPromise })

  try {
    const result = await cancelBooking(payload, id, cancelToken)
    return NextResponse.json({ status: result.status, scheduleVersion: result.scheduleVersion })
  } catch (err: unknown) {
    if (err instanceof BookingError) {
      return NextResponse.json({ error: err.code, message: err.message }, { status: err.status })
    }
    return NextResponse.json({ error: 'INTERNAL' }, { status: 500 })
  }
}
