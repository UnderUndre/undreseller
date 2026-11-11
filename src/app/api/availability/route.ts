import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'

import configPromise from '@payload-config'

import { resolveAvailability } from '@/lib/availability/resolver'
import { getCachedSlots, setCachedSlots } from '@/lib/availability/slotCache'
import { checkRateLimit, clientIpFrom } from '@/lib/security/rateLimiter'

/** Public availability endpoint (spec 002-booking-domain US4, FR-205; 008 T841 RL + cache). */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const ip = clientIpFrom(req)
  const rl = checkRateLimit(`availability:${ip}`, 60, 60_000)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'RATE_LIMITED', retryAfterSec: rl.retryAfterSec },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    )
  }

  const { searchParams } = new URL(req.url)
  const service = searchParams.get('service')
  const date = searchParams.get('date')
  const resourceId = searchParams.get('resourceId') ?? undefined

  if (!service || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { error: 'service and date (YYYY-MM-DD) are required' },
      { status: 400 },
    )
  }

  const cacheKey = `${service}:${date}:${resourceId ?? ''}`
  const cached = getCachedSlots<Record<string, unknown>>(cacheKey)
  if (cached) {
    return NextResponse.json(cached)
  }

  const payload = await getPayload({ config: configPromise })

  const result = await resolveAvailability(payload, { productId: service, date, resourceId })
  if (!result.ok) {
    return NextResponse.json({ error: result.code }, { status: result.code === 'SERVICE_NOT_FOUND' ? 404 : 422 })
  }

  const body = {
    service,
    date,
    resourceId: result.resourceId,
    timeZone: result.timeZone,
    slots: result.slots,
  }
  setCachedSlots(cacheKey, body)

  return NextResponse.json(body)
}
