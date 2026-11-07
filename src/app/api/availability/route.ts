import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'

import configPromise from '@payload-config'

import { resolveAvailability } from '@/lib/availability/resolver'

/** Public availability endpoint (spec 002-booking-domain US4, FR-205). */
export async function GET(req: NextRequest): Promise<NextResponse> {
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

  const payload = await getPayload({ config: configPromise })

  const result = await resolveAvailability(payload, { productId: service, date, resourceId })
  if (!result.ok) {
    return NextResponse.json({ error: result.code }, { status: result.code === 'SERVICE_NOT_FOUND' ? 404 : 422 })
  }

  return NextResponse.json({
    service,
    date,
    resourceId: result.resourceId,
    timeZone: result.timeZone,
    slots: result.slots,
  })
}
