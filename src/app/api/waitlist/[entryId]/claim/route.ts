import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'

import configPromise from '@payload-config'

import { BookingError } from '@/lib/booking/bookingService'
import { claimWaitlistEntry, WaitlistError } from '@/lib/waitlist/waitlistService'
import { checkRateLimit, clientIpFrom } from '@/lib/security/rateLimiter'

/**
 * Waitlist claim (spec 006 US3, FR-603 — Risk 20): thin HTTP adapter over
 * `claimWaitlistEntry` — the domain logic (token verify → CAS convert → FSM
 * CREATE_BOOKING → co-candidate re-arm → audit) lives ONLY in the service
 * (008 T812 / F-BE-12: the route/service duplication had already diverged).
 * The client idempotencyKey is REMOVED: the service derives its own
 * server-side key from the DB entry (waitlist-claim-<entryId>-<campaign>-<slot>).
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ entryId: string }> },
): Promise<NextResponse> {
  const ip = clientIpFrom(req)
  const rl = checkRateLimit(`waitlist-claim:${ip}`)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'RATE_LIMITED', retryAfterSec: rl.retryAfterSec },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    )
  }

  const { entryId } = await context.params
  const token = req.nextUrl.searchParams.get('token') ?? ''

  const payload = await getPayload({ config: configPromise })
  try {
    const result = await claimWaitlistEntry(payload, { entryId, token })
    // Wire-compatible with the pre-008 contract: the booking object at 201
    // (ClaimWaitlistClient reads reservationId + accessToken).
    return NextResponse.json(result.booking, { status: 201 })
  } catch (err: unknown) {
    if (err instanceof WaitlistError) {
      return NextResponse.json({ error: err.code, message: err.message }, { status: err.status })
    }
    if (err instanceof BookingError) {
      return NextResponse.json({ error: err.code, message: err.message }, { status: err.status })
    }
    const code = (err as { code?: string }).code ?? (err as { cause?: { code?: string } })?.cause?.code
    if (code === '23P01') {
      return NextResponse.json({ error: 'SLOT_TAKEN', message: 'Слот уже занят' }, { status: 409 })
    }
    return NextResponse.json({ error: 'INTERNAL' }, { status: 500 })
  }
}
