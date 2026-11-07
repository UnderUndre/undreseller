import Link from 'next/link'
import { getPayload } from 'payload'

import configPromise from '@payload-config'

export const dynamic = 'force-dynamic'

/** Storefront booking flow entry (spec 002-booking-domain US7). */
export default async function BookPage() {
  const payload = await getPayload({ config: configPromise })
  const services = await payload.find({
    collection: 'products',
    where: { bookable: { equals: true } },
    limit: 50,
    overrideAccess: true,
    depth: 0,
  })

  return (
    <div className="container py-8">
      <h1 className="mb-6 text-3xl font-bold">Book an appointment</h1>
      {services.docs.length === 0 ? (
        <p className="text-neutral-500">No bookable services configured yet.</p>
      ) : (
        <ul className="flex flex-col gap-3" data-testid="service-list">
          {services.docs.map((service) => (
            <li key={service.id}>
              <Link
                href={`/book/${service.slug}`}
                data-testid="service-option"
                className="block rounded-lg border border-neutral-200 p-4 transition-colors hover:border-primary"
              >
                <span className="text-lg font-medium">{service.title}</span>
                {typeof service.durationMin === 'number' && (
                  <span className="ml-2 text-sm text-neutral-500">{service.durationMin} min</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
