import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'

import configPromise from '@payload-config'

import { acknowledgeBooking, BookingError } from '@/lib/booking/bookingService'
import { checkRateLimit, clientIpFrom } from '@/lib/security/rateLimiter'

/** Reminder acknowledgement (spec 003 US3): CAS bump of scheduleVersion. */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const ip = clientIpFrom(req)
  const rl = checkRateLimit(`booking-ack:${ip}`)
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
  const accessToken = typeof body.accessToken === 'string' ? body.accessToken : null
  if (!accessToken) {
    return NextResponse.json({ error: 'accessToken required' }, { status: 400 })
  }

  const payload = await getPayload({ config: configPromise })

  try {
    const result = await acknowledgeBooking(payload, accessToken)
    return NextResponse.json(result)
  } catch (err: unknown) {
    if (err instanceof BookingError) {
      return NextResponse.json({ error: err.code, message: err.message }, { status: err.status })
    }
    return NextResponse.json({ error: 'INTERNAL' }, { status: 500 })
  }
}
