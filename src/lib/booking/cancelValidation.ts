import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import { isBeforeCancellationCutoff } from '@/lib/payments/amounts'
import { verifySha256Token } from '@/lib/booking/tokens'

/**
 * Read-only cancel-token validation (spec 003 US4, review F4): powers the
 * scanner-safe GET view. Never mutates state — the token is consumed only by
 * `cancelBooking` (POST).
 */
export interface CancelTokenView {
  valid: boolean
  status: string
  startTime: string
  cutoffPassed: boolean
  paymentMode: string
}

export async function verifyCancelToken(
  payload: Payload,
  reservationId: string,
  cancelToken: string,
): Promise<CancelTokenView | null> {
  const db: any = payload.db
  const res = await db.execute({
    drizzle: db.drizzle,
    sql: sql`SELECT sr.status, sr.start_time, sr.cancel_token_hash,
                    COALESCE(p.payment_mode, 'NONE') AS payment_mode,
                    COALESCE(p.cancellation_cutoff_hours, 3) AS cutoff_hours
             FROM slot_reservations sr
             LEFT JOIN products p ON p.id::text = sr.item_id
             WHERE sr.id = ${reservationId} LIMIT 1`,
  })
  const row = res.rows?.[0] as
    | {
        status: string
        start_time: string
        cancel_token_hash: string | null
        payment_mode: string
        cutoff_hours: number
      }
    | undefined
  if (!row) return null

  const valid = verifySha256Token(cancelToken, row.cancel_token_hash)
  return {
    valid,
    status: row.status,
    startTime: row.start_time,
    cutoffPassed: !isBeforeCancellationCutoff({
      start: new Date(row.start_time),
      cancellationCutoffHours: row.cutoff_hours,
      now: new Date(),
    }),
    paymentMode: row.payment_mode,
  }
}
