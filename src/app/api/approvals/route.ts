import { sql } from '@payloadcms/db-postgres'
import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'

import configPromise from '@payload-config'

import { hasMinimumRole } from '@/access/roles'
import { approveBooking, BookingError } from '@/lib/booking/bookingService'

/** OPERATOR+ approval surface (spec 002-booking-domain US6, FR-208; канон 001: OPERATOR без /admin). */
async function authorize(req: NextRequest): Promise<{ actorId: string } | null> {
  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({ headers: req.headers })
  if (!user || !hasMinimumRole(user?.roles, 'OPERATOR')) return null
  return { actorId: String(user.id) }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const actor = await authorize(req)
  if (!actor) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })

  const payload = await getPayload({ config: configPromise })
  const pending = await payload.find({
    collection: 'slot-reservations',
    where: { status: { equals: 'PENDING_APPROVAL' } },
    limit: 50,
    overrideAccess: true,
    depth: 0,
    sort: 'startTime',
  })
  return NextResponse.json({
    approvals: pending.docs.map((d) => ({
      reservationId: d.id,
      order: d.order,
      start: d.startTime,
      end: d.endTime,
      customerName: d.customerName,
      customerPhone: d.customerPhone,
      scheduleVersion: d.scheduleVersion,
    })),
  })
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const actor = await authorize(req)
  if (!actor) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 })
  }

  const reservationId = typeof body.reservationId === 'string' ? body.reservationId : null
  const action = body.action
  if (!reservationId || (action !== 'approve' && action !== 'reject')) {
    return NextResponse.json(
      { error: 'VALIDATION_FAILED', required: ['reservationId', 'action: approve|reject'] },
      { status: 400 },
    )
  }

  const payload = await getPayload({ config: configPromise })
  try {
    const result = await approveBooking(payload, {
      reservationId,
      action,
      actorId: actor.actorId,
    })
    return NextResponse.json(result)
  } catch (err: unknown) {
    if (err instanceof BookingError) {
      return NextResponse.json({ error: err.code, message: err.message }, { status: err.status })
    }
    return NextResponse.json({ error: 'INTERNAL' }, { status: 500 })
  }
}
