import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import { logDelivery, sendEmail } from '@/lib/email/resendAdapter'
import { confirmationEmail, reminderEmail } from '@/lib/email/templates'

/**
 * Booking email jobs (spec 003 US3, research D3/D7): ALL outbound booking mail
 * goes through Payload Jobs (retry ≤5 with backoff). The reminder uses the
 * periodic-cron-sweep model (research D7 alternative #1): every 5 minutes a
 * batch query finds due candidates and an atomic CAS UPDATE claims each one —
 * no per-booking zombie jobs on reschedule/cancel.
 */

export interface BookingEmailInput {
  kind: 'confirmation'
  reservationId: number
  email: string
  customerName: string
  cancelToken: string
  rescheduleToken: string
  accessToken: string
}

export const bookingEmailTask = {
  slug: 'booking-email',
  label: 'Send booking confirmation email (spec 003 FR-305)',
  retries: 5,
  // Runtime contract verified in payload 3.93 dist: { inlineTask, input, job, req, tasks }.
  handler: async ({ req, input }: { req: { payload: Payload }; input: unknown }) => {
    const data = input as BookingEmailInput
    const payload = req.payload
    const db: any = payload.db
    const row = await db.execute({
      drizzle: db.drizzle,
      sql: sql`SELECT sr.start_time, p.title AS service_title
               FROM slot_reservations sr
               LEFT JOIN products p ON p.id = sr.item_id
               WHERE sr.id = ${data.reservationId} LIMIT 1`,
    })
    const booking = (row.rows?.[0] ?? {}) as { start_time?: string; service_title?: string | null }
    const message = confirmationEmail({
      customerName: data.customerName,
      bookingId: data.reservationId,
      startTime: booking.start_time ?? new Date().toISOString(),
      serviceName: booking.service_title ?? undefined,
      cancelToken: data.cancelToken,
      rescheduleToken: data.rescheduleToken,
    })
    try {
      await sendEmail(payload, { to: data.email, subject: message.subject, html: message.html })
      await logDelivery(payload, {
        kind: 'confirmation',
        status: 'sent',
        bookingId: data.reservationId,
        email: data.email,
      })
    } catch (err: unknown) {
      await logDelivery(payload, {
        kind: 'confirmation',
        status: 'failed',
        bookingId: data.reservationId,
        email: data.email,
        errorDetail: err instanceof Error ? err.name : 'UNKNOWN',
      })
      throw err
    }
    return { output: { sent: true }, state: 'succeeded' as const }
  },
}

export interface ReminderSweepResult {
  sent: number
  failed: number
}

async function noticeHours(payload: Payload): Promise<number> {
  try {
    const settings = await payload.findGlobal({ slug: 'shop-settings', depth: 0 })
    const h = (settings as { confirmationNoticeHours?: number } | null)?.confirmationNoticeHours
    return typeof h === 'number' && h >= 1 ? h : 24
  } catch {
    return 24
  }
}

export async function runReminderSweep(payload: Payload): Promise<ReminderSweepResult> {
  const db: any = payload.db
  const hours = await noticeHours(payload)
  const due = await db.execute({
    drizzle: db.drizzle,
    sql: sql`SELECT sr.id, sr.schedule_version, sr.start_time, sr.customer_name,
                    o.access_token, o.customer_email
             FROM slot_reservations sr
             JOIN orders o ON o.id = sr.order_id
             WHERE sr.status = 'BOOKED'
               AND sr.reminder_sent_at IS NULL
               AND o.customer_email IS NOT NULL
               AND sr.start_time - make_interval(hours => ${hours}) <= now()
               AND sr.start_time > now()
             LIMIT 50`,
  })

  let sent = 0
  let failed = 0
  for (const raw of (due.rows ?? []) as Array<{
    id: number
    schedule_version: number
    start_time: string
    customer_name: string
    access_token: string
    customer_email: string
  }>) {
    // Exactly-once claim (CAS): the concurrent worker loses here (spec TC-003-013).
    const claim = await db.execute({
      drizzle: db.drizzle,
      sql: sql`UPDATE slot_reservations
               SET reminder_sent_at = now(), updated_at = now()
               WHERE id = ${raw.id} AND schedule_version = ${raw.schedule_version} AND reminder_sent_at IS NULL
               RETURNING id`,
    })
    if ((claim.rows ?? []).length === 0) continue

    const message = reminderEmail({
      customerName: raw.customer_name,
      bookingId: raw.id,
      accessToken: raw.access_token,
      startTime: raw.start_time,
    })
    try {
      await sendEmail(payload, { to: raw.customer_email, subject: message.subject, html: message.html })
      await logDelivery(payload, {
        kind: 'reminder',
        status: 'sent',
        bookingId: raw.id,
        email: raw.customer_email,
      })
      sent += 1
    } catch (err: unknown) {
      // Revert the claim so the next tick (or job retry) re-attempts (research D7).
      failed += 1
      await db.execute({
        drizzle: db.drizzle,
        sql: sql`UPDATE slot_reservations SET reminder_sent_at = NULL, updated_at = now() WHERE id = ${raw.id}`,
      })
      await logDelivery(payload, {
        kind: 'reminder',
        status: 'failed',
        bookingId: raw.id,
        email: raw.customer_email,
        errorDetail: err instanceof Error ? err.name : 'UNKNOWN',
      })
    }
  }

  return { sent, failed }
}

export const reminderSweepTask = {
  slug: 'reminder-sweep',
  label: 'Periodic reminder sweep with CAS exactly-once send (spec 003 US3/FR-307)',
  schedule: [{ cron: '*/5 * * * *', queue: 'default' }],
  retries: 3,
  // Runtime contract verified in payload 3.93 dist: { inlineTask, input, job, req, tasks }.
  handler: async ({ req }: { req: { payload: Payload } }) => {
    const result = await runReminderSweep(req.payload)
    return { output: result, state: 'succeeded' as const }
  },
}
