import { notFound } from 'next/navigation'
import { getPayload } from 'payload'

import configPromise from '@payload-config'

import { CancelBookingButton } from '@/components/booking/CancelBookingButton'
import { LocalTime } from '@/components/booking/LocalTime'
import { DepositPayment } from '@/components/booking/DepositPayment'
import { retrieveClientSecret } from '@/lib/payments/stripeGateway'

export const dynamic = 'force-dynamic'

interface SnapshotItem {
  productId: string
  title: string
  durationMin: number
  priceInUSD: number
  depositAmount: number
  addOn: boolean
}

/** Post-booking status page with the one-time cancel link (spec 002 US7; 014 itemized). */
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
  const order = orders.docs[0] as unknown as {
    id: number
    status: string
    stripePaymentIntentRef?: string | null
    amount?: number
  }

  const reservation = await payload.find({
    collection: 'slot-reservations',
    where: { order: { equals: id } },
    limit: 1,
    overrideAccess: true,
    depth: 0,
  })
  const slot = reservation.docs[0] as unknown as {
    id: number
    status: string
    startTime: string
    itemId?: string | null
    itemsJson?: SnapshotItem[] | null
  } | undefined

  // 014 FR-1405 (fix AG-F6.2): aggregates come from the items_json SNAPSHOT
  // (Σ deposit, Σ price) with a legacy fallback that resolves the product via
  // `itemId` (a TEXT field — NOT a relationship, so `slot.item` never existed;
  // the old page silently failed to render DepositPayment for prepaid modes).
  const snapshot: SnapshotItem[] = Array.isArray(slot?.itemsJson) ? (slot!.itemsJson as SnapshotItem[]) : []
  let paymentMode: string | null = null
  let depositTotal = 0
  let priceTotal = 0
  if (snapshot.length > 0) {
    depositTotal = snapshot.reduce((s, i) => s + (i.depositAmount ?? 0), 0)
    priceTotal = snapshot.reduce((s, i) => s + (i.priceInUSD ?? 0), 0)
    const primaryId = slot?.itemId ?? snapshot.find((i) => !i.addOn)?.productId ?? snapshot[0]?.productId
    if (primaryId) {
      const p = (await payload
        .findByID({ collection: 'products', id: String(primaryId), overrideAccess: true, depth: 0 })
        .catch(() => null)) as unknown as { paymentMode?: string } | null
      paymentMode = p?.paymentMode ?? null
    }
  } else if (slot?.itemId) {
    const p = (await payload
      .findByID({ collection: 'products', id: String(slot.itemId), overrideAccess: true, depth: 0 })
      .catch(() => null)) as unknown as { title?: string; priceInUSD?: number; paymentMode?: string; depositAmount?: number } | null
    if (p) {
      paymentMode = p.paymentMode ?? null
      priceTotal = p.priceInUSD ?? 0
      depositTotal = p.depositAmount ?? 0
    }
  }

  let clientSecret: string | null = null
  const isHeld = slot && (slot.status === 'HELD' || slot.status === 'PAYMENT_PENDING')
  if (isHeld && order.stripePaymentIntentRef) {
    clientSecret = await retrieveClientSecret(order.stripePaymentIntentRef)
  }

  return (
    <div className="container py-12" data-testid="booking-confirmed">
      <h1 className="mb-4 text-3xl font-bold">Booking confirmed</h1>
      {slot ? (
        <p className="mb-2">
          Appointment:{' '}
          <strong className="font-semibold"><LocalTime iso={slot.startTime} /></strong> —{' '}
          {String(slot.status)}
        </p>
      ) : null}
      {snapshot.length > 1 ? (
        <ul className="mb-4 list-disc pl-6" data-testid="booking-items">
          {snapshot.map((i) => (
            <li key={`${i.productId}-${i.title}`}>
              {i.title} — {i.durationMin} min · ${Number(i.priceInUSD ?? 0).toFixed(2)}
              {i.addOn ? ' (add-on)' : ''}
            </li>
          ))}
        </ul>
      ) : null}
      {clientSecret && paymentMode === 'DEPOSIT' ? (
        <DepositPayment
          clientSecret={clientSecret}
          bookingId={id}
          depositAmount={depositTotal}
          totalPrice={priceTotal}
        />
      ) : null}
      {clientSecret && paymentMode === 'FULL_PREPAYMENT' ? (
        <DepositPayment
          clientSecret={clientSecret}
          bookingId={id}
          depositAmount={priceTotal}
          totalPrice={priceTotal}
        />
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
