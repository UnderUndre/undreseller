import { sql } from '@payloadcms/db-postgres'
import { getPayload } from 'payload'

import configPromise from '@payload-config'

import { ReschedulePicker } from '@/components/booking/ReschedulePicker'
import { verifyTokenHash } from '@/lib/booking/tokens'

/** GET prefill page (spec 003 US4): scanner-safe — validates the one-time
 * reschedule token and reports the prefilled service without consuming it.
 * The atomic exchange happens only when the user confirms a new slot (POST). */
export default async function ReschedulePage(props: {
  searchParams: Promise<{ bookingId?: string; token?: string }>
}) {
  const { bookingId = '', token = '' } = await props.searchParams

  if (!bookingId || !token) {
    return <p>Invalid link: bookingId and token are required.</p>
  }

  const payload = await getPayload({ config: configPromise })
  const db: any = payload.db
  const res = await db.execute({
    drizzle: db.drizzle,
    sql: sql`SELECT sr.status, sr.start_time, sr.reschedule_token_hash, sr.item_id
             FROM slot_reservations sr WHERE sr.id = ${bookingId} LIMIT 1`,
  })
  const row = res.rows?.[0] as
    | { status: string; start_time: string; reschedule_token_hash: string | null; item_id: string | null }
    | undefined

  if (!row) return <p>Booking not found.</p>
  if (row.status === 'RELEASED') return <p>This booking is cancelled — nothing to reschedule.</p>
  if (!verifyTokenHash(token, row.reschedule_token_hash)) {
    return <p>This reschedule link is not valid (possibly already used).</p>
  }

  return (
    <div>
      <h1>Reschedule booking</h1>
      <p>Current appointment: {new Date(row.start_time).toLocaleString()}</p>
      <p>Your appointment stays safe until you confirm a new slot.</p>
      {row.item_id ? (
        <ReschedulePicker productId={row.item_id} bookingId={bookingId} token={token} />
      ) : (
        <p>Service reference missing.</p>
      )}
    </div>
  )
}
