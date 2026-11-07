import { sql } from '@payloadcms/db-postgres'
import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'

import configPromise from '@payload-config'

import { BookingError, rescheduleBooking } from '@/lib/booking/bookingService'
import { verifyTokenHash } from '@/lib/booking/tokens'
import { checkRateLimit, clientIpFrom } from '@/lib/security/rateLimiter'

/** Scanner-safe view (spec 003 US4, review F4): GET only validates the token —
 * the atomic slot exchange happens strictly on POST (research D6). */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await context.params
  const token = req.nextUrl.searchParams.get('token') ?? ''
  if (!token) {
    return NextResponse.json({ error: 'rescheduleToken required' }, { status: 400 })
  }
  const payload = await getPayload({ config: configPromise })
  const db: any = payload.db
  const res = await db.execute({
    drizzle: db.drizzle,
    sql: sql`
      SELECT sr.status, sr.start_time, sr.reschedule_token_hash, sr.item_id
      FROM slot_reservations sr WHERE sr.id = ${id} LIMIT 1`,
  })
  const row = res.rows?.[0] as
    | { status: string; start_time: string; reschedule_token_hash: string | null; item_id: string | null }
    | undefined
  if (!row) return NextResponse.json({ error: 'BOOKING_NOT_FOUND' }, { status: 404 })
  if (row.status === 'RELEASED') {
    return NextResponse.json({ error: 'BOOKING_NOT_ACTIVE' }, { status: 422 })
  }
  if (!verifyTokenHash(token, row.reschedule_token_hash)) {
    return NextResponse.json({ error: 'INVALID_TOKEN' }, { status: 403 })
  }
  return NextResponse.json({ valid: true, status: row.status, startTime: row.start_time, productId: row.item_id })
}

/** Atomic slot exchange (spec 003 US4, review F5): old slot releases ONLY when
 * the new one commits; PREPAID orders keep their captured payment. */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const ip = clientIpFrom(req)
  const rl = checkRateLimit(`booking-reschedule:${ip}`)
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
  const rescheduleToken = typeof body.rescheduleToken === 'string' ? body.rescheduleToken : null
  const newStart = typeof body.newStart === 'string' ? body.newStart : null
  const resourceId = typeof body.resourceId === 'string' ? body.resourceId : undefined
  if (!rescheduleToken || !newStart) {
    return NextResponse.json(
      { error: 'VALIDATION_FAILED', required: ['rescheduleToken', 'newStart'] },
      { status: 400 },
    )
  }

  const payload = await getPayload({ config: configPromise })

  try {
    const result = await rescheduleBooking(payload, {
      reservationId: id,
      rescheduleToken,
      newStart,
      resourceId,
    })
    return NextResponse.json(result)
  } catch (err: unknown) {
    if (err instanceof BookingError) {
      return NextResponse.json({ error: err.code, message: err.message }, { status: err.status })
    }
    return NextResponse.json({ error: 'INTERNAL' }, { status: 500 })
  }
}
