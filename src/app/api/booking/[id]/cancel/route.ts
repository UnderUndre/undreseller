import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'

import configPromise from '@payload-config'

import { BookingError, cancelBooking } from '@/lib/booking/bookingService'
import { checkRateLimit, clientIpFrom } from '@/lib/security/rateLimiter'
import { verifyCancelToken } from '@/lib/booking/cancelValidation'

/** Scanner-safe view (spec 003 US4, review F4): GET validates the token and
 * reports the cancellation window WITHOUT consuming it — email prefetch
 * scanners (SafeLinks etc.) can never destroy a one-time token. */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await context.params
  const token = req.nextUrl.searchParams.get('token') ?? ''
  if (!token) {
    return NextResponse.json({ error: 'cancelToken required' }, { status: 400 })
  }
  const payload = await getPayload({ config: configPromise })
  const view = await verifyCancelToken(payload, id, token)
  if (!view) return NextResponse.json({ error: 'BOOKING_NOT_FOUND' }, { status: 404 })
  if (!view.valid) return NextResponse.json({ error: 'INVALID_TOKEN' }, { status: 403 })
  return NextResponse.json({
    valid: true,
    status: view.status,
    startTime: view.startTime,
    cutoffPassed: view.cutoffPassed,
    paymentMode: view.paymentMode,
  })
}

/** Customer cancel by one-time cancelToken (spec 002 US5 AC5 + 003 FR-304). */
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
    return NextResponse.json({
      status: result.status,
      scheduleVersion: result.scheduleVersion,
      refund: result.refund ?? 'not-applicable',
    })
  } catch (err: unknown) {
    if (err instanceof BookingError) {
      return NextResponse.json({ error: err.code, message: err.message }, { status: err.status })
    }
    return NextResponse.json({ error: 'INTERNAL' }, { status: 500 })
  }
}
