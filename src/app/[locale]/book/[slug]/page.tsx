import { notFound } from 'next/navigation'
import { getPayload } from 'payload'

import configPromise from '@payload-config'

import { SlotGrid } from '@/components/booking/SlotGrid'
import type { CompositeItemDTO } from '@/components/booking/types'

export const dynamic = 'force-dynamic'

/** Service slot-booking page (spec 002 US7; composite add-ons per spec 014 FR-1405/T1432). */
export default async function BookServicePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const payload = await getPayload({ config: configPromise })

  // 015 (fix AG-F4.3): the primary is loaded by a SLUG-SCOPED query — finding it
  // inside a `limit: 50` list scan breaks (404) once more than 50 bookable
  // products exist (long e2e runs seed dozens of services).
  const primaries = await payload.find({
    collection: 'products',
    where: { and: [{ slug: { equals: slug } }, { bookable: { equals: true } }] },
    limit: 1,
    overrideAccess: true,
    depth: 0,
  })
  if (primaries.docs.length === 0) notFound()
  const primary = primaries.docs[0] as unknown as Record<string, unknown> & {
    id: number | string
    title: string
    slug?: string
  }

  // 014 (fix AG-F6.1): candidates for «Добавить к визит» — all active bookable
  // services filtered by payment-mode compatibility (same mode, or a FREE
  // add-on which is mode-neutral). The client never sees checkboxes that would
  // 422 on submit.
  const bookable = await payload.find({
    collection: 'products',
    where: { bookable: { equals: true } },
    limit: 50,
    overrideAccess: true,
    depth: 0,
  })
  const docs = bookable.docs as unknown as Array<
    Record<string, unknown> & { id: number | string; title: string; slug?: string }
  >

  const primaryMode = (primary.paymentMode as string) ?? 'NONE'
  const toDto = (d: Record<string, unknown>): CompositeItemDTO => ({
    productId: String(d.id),
    title: d.title as string,
    durationMin: (d.durationMin as number) ?? 0,
    priceInUSD: (d.priceInUSD as number) ?? 0,
    addOn: d.addOn === true,
  })
  const isFreeAddOn = (d: Record<string, unknown>) =>
    d.addOn === true && ((d.priceInUSD as number) ?? 0) === 0

  const primaryService = toDto(primary)
  const availableAddOns = docs
    .filter((d) => String(d.id) !== String(primary.id))
    .filter((d) => isFreeAddOn(d) || ((d.paymentMode as string) ?? 'NONE') === primaryMode)
    .map(toDto)

  return (
    <div className="container py-8">
      <h1 className="mb-6 text-3xl font-bold">{primary.title}</h1>
      {typeof primary.durationMin === 'number' && (
        <p className="mb-4 text-neutral-500">Duration: {primary.durationMin} min</p>
      )}
      <SlotGrid serviceId={String(primary.id)} primaryService={primaryService} availableAddOns={availableAddOns} />
    </div>
  )
}
