import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'

import configPromise from '@payload-config'

import { resolveAvailability } from '@/lib/availability/resolver'
import { getCachedSlots, setCachedSlots } from '@/lib/availability/slotCache'
import { checkRateLimit, clientIpFrom } from '@/lib/security/rateLimiter'
import {
  MAX_ITEMS,
  deriveComposite,
  type CompositeProductRow,
} from '@/lib/booking/compositeService'

/**
 * Public availability endpoint (spec 002 US4/FR-205; 008 T841 RL + cache;
 * composite delta spec 014 FR-1403).
 *
 * Composite (fix AG-F3.1): repeated `items` query-params (`?items=12&items=15`)
 * derive the container duration (Σ) + max-buffers. The cache key INCLUDES the
 * canonicalized items list — otherwise a 60-min grid poisons the 90-min request
 * (and vice versa). `items[]` without `service` is legal: the first item acts
 * as the primary (effectiveService).
 */
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
  const itemIds = searchParams.getAll('items').filter((v) => v.length > 0)
  const effectiveService = service ?? itemIds[0]

  if (!effectiveService || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { error: 'service (or items) and date (YYYY-MM-DD) are required' },
      { status: 400 },
    )
  }

  const cacheKey = `${effectiveService}:${itemIds.join(',')}:${date}:${resourceId ?? ''}`
  const cached = getCachedSlots<Record<string, unknown>>(cacheKey)
  if (cached) {
    return NextResponse.json(cached)
  }

  const payload = await getPayload({ config: configPromise })

  // Composite derivation: fetch all basket products server-side (fix AG-F3.1/F5 —
  // the client sends ids only). Legacy parity (fix AG-F5.2): a single-item query
  // keeps the 404/422 codes of the old endpoint.
  let composite: { durationMin: number; bufferBeforeMin: number; bufferAfterMin: number } | undefined
  let totalDurationMin: number | undefined
  if (itemIds.length > 0) {
    if (itemIds.length > MAX_ITEMS) {
      return NextResponse.json({ error: 'COMPOSITE_TOO_LONG', message: `Basket is limited to ${MAX_ITEMS} positions` }, { status: 422 })
    }
    const docs = await payload.find({
      collection: 'products',
      where: { id: { in: itemIds } },
      limit: MAX_ITEMS,
      overrideAccess: true,
      depth: 0,
    })
    const byId = new Map<string, Record<string, unknown>>(
      docs.docs.map((d) => [String(d.id), d as unknown as Record<string, unknown>]),
    )
    if (itemIds.length === 1) {
      const doc = byId.get(String(itemIds[0]))
      if (!doc) return NextResponse.json({ error: 'SERVICE_NOT_FOUND' }, { status: 404 })
      if (doc.bookable !== true) {
        return NextResponse.json({ error: 'SERVICE_NOT_BOOKABLE' }, { status: 422 })
      }
    }
    const rows: CompositeProductRow[] = itemIds.map((id) => {
      const d = (byId.get(String(id)) ?? {}) as Record<string, unknown>
      return {
        id: String(id),
        title: (d.title as string) ?? '',
        durationMin: (d.durationMin as number) ?? 0,
        priceInUSD: (d.priceInUSD as number) ?? 0,
        depositAmount: (d.depositAmount as number) ?? 0,
        addOn: d.addOn === true,
        paymentMode: (d.paymentMode as string) ?? 'NONE',
        bufferBeforeMin: (d.bufferBeforeMin as number) ?? 0,
        bufferAfterMin: (d.bufferAfterMin as number) ?? 0,
        outCallEnabled: d.outCallEnabled === true,
      }
    })
    const derived = deriveComposite(itemIds, rows)
    if (!derived.ok) {
      return NextResponse.json({ error: derived.code, message: derived.message }, { status: 422 })
    }
    composite = {
      durationMin: derived.composite.totalDurationMin,
      bufferBeforeMin: derived.composite.bufferBeforeMin,
      bufferAfterMin: derived.composite.bufferAfterMin,
    }
    totalDurationMin = derived.composite.totalDurationMin
  }

  const result = await resolveAvailability(payload, {
    productId: effectiveService,
    date,
    resourceId,
    composite,
  })
  if (!result.ok) {
    return NextResponse.json({ error: result.code }, { status: result.code === 'SERVICE_NOT_FOUND' ? 404 : 422 })
  }

  const body = {
    service: effectiveService,
    ...(totalDurationMin !== undefined ? { totalDurationMin } : {}),
    date,
    resourceId: result.resourceId,
    timeZone: result.timeZone,
    slots: result.slots,
  }
  setCachedSlots(cacheKey, body)

  return NextResponse.json(body)
}
