import { notFound } from 'next/navigation'
import { getPayload } from 'payload'

import configPromise from '@payload-config'

import { SlotGrid } from '@/components/booking/SlotGrid'

export const dynamic = 'force-dynamic'

/** Service slot-booking page (spec 002-booking-domain US7). */
export default async function BookServicePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const payload = await getPayload({ config: configPromise })
  const services = await payload.find({
    collection: 'products',
    where: { and: [{ slug: { equals: slug } }, { bookable: { equals: true } }] },
    limit: 1,
    overrideAccess: true,
    depth: 0,
  })
  if (services.docs.length === 0) notFound()
  const service = services.docs[0]

  return (
    <div className="container py-8">
      <h1 className="mb-6 text-3xl font-bold">{service.title}</h1>
      {typeof service.durationMin === 'number' && (
        <p className="mb-4 text-neutral-500">Duration: {service.durationMin} min</p>
      )}
      <SlotGrid
        serviceId={String(service.id)}
        onBooked={({ reservationId, accessToken, cancelToken }) => {
          window.location.href =
            `/book/confirmation/${reservationId}` +
            `?accessToken=${encodeURIComponent(accessToken)}` +
            `&cancelToken=${encodeURIComponent(cancelToken)}`
        }}
      />
    </div>
  )
}
