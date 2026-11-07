import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'

import configPromise from '@payload-config'

/** Guest booking lookup by accessToken (spec 002-booking-domain US5, guest-order canon 001). */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await context.params
  const accessToken = req.nextUrl.searchParams.get('accessToken')
  if (!accessToken) {
    return NextResponse.json({ error: 'accessToken required' }, { status: 400 })
  }

  const payload = await getPayload({ config: configPromise })

  const order = await payload.find({
    collection: 'orders',
    where: { and: [{ id: { equals: id } }, { accessToken: { equals: accessToken } }] },
    limit: 1,
    overrideAccess: true,
    depth: 0,
  })
  if (order.docs.length === 0) {
    return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
  }

  const reservation = await payload.find({
    collection: 'slot-reservations',
    where: { order: { equals: id } },
    limit: 1,
    overrideAccess: true,
    depth: 0,
  })

  const slot = reservation.docs[0]
  return NextResponse.json({
    orderId: order.docs[0].id,
    status: order.docs[0].status,
    booking: slot
      ? {
          reservationId: slot.id,
          start: slot.startTime,
          end: slot.endTime,
          status: slot.status,
          scheduleVersion: slot.scheduleVersion,
        }
      : null,
  })
}
