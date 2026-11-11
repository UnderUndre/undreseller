import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'

import configPromise from '@payload-config'

import { confirmWaitlistEntry, WaitlistError } from '@/lib/waitlist/waitlistService'
import { checkRateLimit, clientIpFrom } from '@/lib/security/rateLimiter'

/**
 * Double-opt-in confirm (spec 007 FR-704, review F9): the explicit POST from
 * the scanner-safe landing. GET never mutates — the landing page only renders.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ entryId: string }> },
): Promise<NextResponse> {
  const rl = checkRateLimit(`waitlist-confirm:${clientIpFrom(req)}`)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'RATE_LIMITED', retryAfterSec: rl.retryAfterSec },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    )
  }

  const { entryId } = await ctx.params

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 })
  }
  const token = typeof body.token === 'string' ? body.token : ''
  if (!token) {
    return NextResponse.json({ error: 'VALIDATION_FAILED', required: ['token'] }, { status: 400 })
  }

  const payload = await getPayload({ config: configPromise })
  try {
    const result = await confirmWaitlistEntry(payload, { entryId, token })
    return NextResponse.json({ status: result.status }, { status: 200 })
  } catch (err: unknown) {
    if (err instanceof WaitlistError) {
      return NextResponse.json({ error: err.code, message: err.message }, { status: err.status })
    }
    return NextResponse.json({ error: 'INTERNAL' }, { status: 500 })
  }
}
