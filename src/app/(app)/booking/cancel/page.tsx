import { getPayload } from 'payload'

import configPromise from '@payload-config'

import { ConfirmCancelForm } from '@/components/booking/ConfirmCancelForm'
import { verifyCancelToken } from '@/lib/booking/cancelValidation'

/**
 * Customer cancel page (spec 003 US4): GET renders the confirmation form and
 * NEVER consumes the token — email prefetch scanners (SafeLinks, Google
 * Workspace) hit this page safely; only the form POST consumes the token.
 */
export default async function CancelBookingPage(props: {
  searchParams: Promise<{ bookingId?: string; token?: string }>
}) {
  const { bookingId = '', token = '' } = await props.searchParams

  if (!bookingId || !token) {
    return <p>Invalid link: bookingId and token are required.</p>
  }

  const payload = await getPayload({ config: configPromise })
  const view = await verifyCancelToken(payload, bookingId, token)

  if (!view) return <p>Booking not found.</p>
  if (!view.valid) return <p>This cancel link is not valid.</p>
  if (view.status === 'RELEASED') return <p>This booking is already cancelled.</p>

  return (
    <div>
      <h1>Cancel booking</h1>
      <p>Appointment: {new Date(view.startTime).toLocaleString()}</p>
      {view.paymentMode === 'FULL_PREPAYMENT' && (
        <p>
          {view.cutoffPassed
            ? 'The free-cancellation window has passed: a refund request will be reviewed by staff (24h SLA).'
            : 'You are inside the free-cancellation window: payment will be refunded automatically.'}
        </p>
      )}
      <ConfirmCancelForm bookingId={bookingId} token={token} />
    </div>
  )
}
