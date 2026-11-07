import { notFound } from 'next/navigation'
import { getPayload } from 'payload'

import configPromise from '@payload-config'

import { CancelBookingButton } from '@/components/booking/CancelBookingButton'

export const dynamic = 'force-dynamic'

/** Post-booking status page with the one-time cancel link (spec 002 US7). */
export default async function BookingConfirmationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ accessToken?: string; cancelToken?: string }>
}) {
  const { id } = await params
  const { accessToken, cancelToken } = await searchParams
  if (!accessToken) notFound()

  const payload = await getPayload({ config: configPromise })
  const orders = await payload.find({
    collection: 'orders',
    where: { and: [{ id: { equals: id } }, { accessToken: { equals: accessToken } }] },
    limit: 1,
    overrideAccess: true,
    depth: 0,
  })
  if (orders.docs.length === 0) notFound()

  const reservation = await payload.find({
    collection: 'slot-reservations',
    where: { order: { equals: id } },
    limit: 1,
    overrideAccess: true,
    depth: 0,
  })
  const slot = reservation.docs[0]

  return (
    <div className="container py-12" data-testid="booking-confirmed">
      <h1 className="mb-4 text-3xl font-bold">Booking confirmed</h1>
      {slot ? (
        <p className="mb-2">
          Appointment:{' '}
          <strong>{new Date(slot.startTime as string).toLocaleString()}</strong> —{' '}
          {String(slot.status)}
        </p>
      ) : null}
      {cancelToken ? (
        <div className="mt-6">
          <CancelBookingButton
            reservationId={id}
            cancelToken={cancelToken}
            testId="cancel-link"
            label="Cancel this appointment"
          />
          <p className="mt-2 text-xs text-neutral-500">
            This cancel link works exactly once. Keep this page if you might need to cancel.
          </p>
        </div>
      ) : null}
    </div>
  )
}
