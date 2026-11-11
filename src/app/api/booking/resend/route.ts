import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'

import configPromise from '@payload-config'

import { IntentError, resendIntent } from '@/lib/booking/intentService'
import { auditHoneypotHit, honeypotFilled } from '@/lib/security/honeypot'
import { checkRateLimit, clientIpFrom } from '@/lib/security/rateLimiter'

/**
 * OTP resend (spec 007 FR-702, review F2): rotates codeHash + refreshes
 * expiresAt on the EXISTING pending intent — duplicates are never created,
 * ≤ 3 / 10 min per intent (service-enforced). Payload beyond intentId is
 * ignored; the email goes to the address stored ON the intent.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const ip = clientIpFrom(req)
  const rl = checkRateLimit(`booking-resend:${ip}`)
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

  if (honeypotFilled(body)) {
    await auditHoneypotHit(payload, 'booking')
    return NextResponse.json({ ok: true }, { status: 200 })
  }

  const intentId = typeof body.intentId === 'string' ? body.intentId : null
  if (!intentId) {
    return NextResponse.json({ error: 'VALIDATION_FAILED', required: ['intentId'] }, { status: 400 })
  }

  try {
    const result = await resendIntent(payload, { intentId })
    return NextResponse.json(
      { intentId: String(result.intentId), expiresAt: result.expiresAt, emailSent: result.emailSent },
      { status: 200 },
    )
  } catch (err: unknown) {
    if (err instanceof IntentError) {
      const headers = err.retryAfterSec ? { 'Retry-After': String(err.retryAfterSec) } : undefined
      return NextResponse.json(
        { error: err.code, message: err.message, ...(err.retryAfterSec ? { retryAfterSec: err.retryAfterSec } : {}) },
        { status: err.status, headers },
      )
    }
    return NextResponse.json({ error: 'INTERNAL' }, { status: 500 })
  }
}
