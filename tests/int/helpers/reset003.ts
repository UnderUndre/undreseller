import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

/**
 * Test-DB hygiene for the 003 suites (run-last files): the isolated
 * `undreseller_test` database is NOT truncated between runs, so leftover
 * bookings from a previous run would block slot buckets. Truncating at the
 * start of each 003 file keeps rapid re-runs deterministic; earlier suites
 * (alphabetically before `prepaid-*`) are already done by then.
 */
export async function resetBookingTables(payload: Payload): Promise<void> {
  const db: any = payload.db
  await db.execute({
    drizzle: db.drizzle,
    sql: sql`TRUNCATE TABLE slot_reservations, orders, audit_events, payment_events,
             inbox_events, email_delivery_log, payload_jobs, products, resources,
             telegram_outbox, tg_links, blacklist, waitlist_entries, booking_intents
             RESTART IDENTITY CASCADE`,
  })
}
