import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'

import configPromise from '@payload-config'

import { WaitlistError, joinWaitlist } from '@/lib/waitlist/waitlistService'
import { auditHoneypotHit, honeypotFilled } from '@/lib/security/honeypot'
import { checkRateLimit, clientIpFrom } from '@/lib/security/rateLimiter'

/** Public waitlist join (spec 006 US1, FR-601; double-opt-in per spec 007 FR-704). */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const ip = clientIpFrom(req)
  const rl = checkRateLimit(`waitlist:${ip}`)
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
    await auditHoneypotHit(payload, 'waitlist')
    return NextResponse.json({ ok: true }, { status: 200 })
  }

  const str = (k: string): string => (typeof body[k] === 'string' ? (body[k] as string).trim() : '')
  const customerName = str('customerName')
  const customerPhone = str('customerPhone')
  const customerEmail = str('customerEmail')
  const serviceId = str('serviceId')
  const resourceId = str('resourceId')
  const expiresAt = str('expiresAt') || undefined

  if (!customerName || !customerPhone || !customerEmail || !serviceId) {
    return NextResponse.json(
      { error: 'VALIDATION_FAILED', required: ['customerName', 'customerPhone', 'customerEmail', 'serviceId'] },
      { status: 400 },
    )
  }
  if (customerName.length > 200 || customerPhone.length > 50) {
    return NextResponse.json({ error: 'VALIDATION_FAILED' }, { status: 400 })
  }
  // resourceId is optional only when exactly one active resource exists (002 canon)
  let resolvedResourceId = resourceId
  if (!resolvedResourceId) {
    const payload = await getPayload({ config: configPromise })
    const active = await payload.find({ collection: 'resources', where: { active: { equals: true } }, limit: 1, overrideAccess: true, depth: 0 })
    resolvedResourceId = active.docs[0] ? String(active.docs[0].id) : ''
  }
  if (!resolvedResourceId) {
    return NextResponse.json({ error: 'RESOURCE_NOT_FOUND' }, { status: 422 })
  }

  try {
    const result = await joinWaitlist(payload, {
      customerName,
      customerPhone,
      customerEmail,
      serviceId,
      resourceId: resolvedResourceId,
      expiresAt,
    })
    // 201 = fresh pending entry; 200 = repeat join on a pending entry — the
    // opt-in email was RE-SENT on the existing row (review F9).
    const status = result.optIn === 'resent' ? 200 : 201
    return NextResponse.json(
      { entryId: result.entryId, expiresAt: result.expiresAt, status: 'pending', resent: result.optIn === 'resent' },
      { status },
    )
  } catch (err: unknown) {
    if (err instanceof WaitlistError) {
      return NextResponse.json({ error: err.code, message: err.message }, { status: err.status })
    }
    return NextResponse.json({ error: 'INTERNAL' }, { status: 500 })
  }
}
