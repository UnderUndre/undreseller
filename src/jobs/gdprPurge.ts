import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

/**
 * GDPR purge (spec 004 FR-404, research D6): nightly — TgLinks whose order is
 * terminal > 90 days are deleted (BVA ±1 day, TC-004-018); outbox rows older
 * than 30 days lose text/metaJson (PII minimal-retention). Since spec 007
 * (review F7) it also purges booking intents: dead/expired 30d, consumed 90d.
 */

const PURGE_AFTER_DAYS = 90

export interface GdprPurgeResult {
  tgLinksPurged: number
  outboxMetaCleared: number
  intentsPurged: number
}

export async function runGdprPurge(payload: Payload): Promise<GdprPurgeResult> {
  const db: any = payload.db

  // TgLink purge: terminal order (cancelled/refunded/completed) older than 90 days.
  const purge = await db.execute({
    drizzle: db.drizzle,
    sql: sql`WITH terminal AS (
            SELECT id FROM orders
            WHERE status IN ('cancelled', 'refunded', 'completed', 'refund_rejected')
              AND updated_at < now() - (${PURGE_AFTER_DAYS} || ' days')::interval
          )
          DELETE FROM tg_links t
          USING terminal
          WHERE t.order_id = terminal.id
          RETURNING t.id`,
  })
  const tgLinksPurged = (purge.rows ?? []).length

  // Waitlist GDPR (spec 006 review F11): terminal entries older than 90 days.
  await db.execute({
    drizzle: db.drizzle,
    sql: sql`DELETE FROM waitlist_entries
             WHERE status IN ('converted', 'expired', 'cancelled')
               AND updated_at < now() - interval '90 days'`,
  })

  // Booking intents (spec 007 review F7): dead/expired 30d, consumed 90d —
  // consumed rows are the 90d retention source of the trust-cookie era.
  const deadIntents = await db.execute({
    drizzle: db.drizzle,
    sql: sql`DELETE FROM booking_intents
             WHERE (status IN ('dead', 'expired') AND updated_at < now() - interval '30 days')
                OR (status = 'consumed' AND updated_at < now() - interval '90 days')
             RETURNING id`,
  })
  const intentsPurged = (deadIntents.rows ?? []).length

  // Outbox minimal retention: strip PII-bearing text/markup/meta older than 30 days.
  const meta = await db.execute({
    drizzle: db.drizzle,
    sql: sql`UPDATE telegram_outbox
          SET text = NULL, reply_markup_json = NULL, meta_json = NULL, updated_at = now()
          WHERE created_at < now() - interval '30 days'
            AND status IN ('sent', 'dead', 'failed')`,
  })
  const outboxMetaCleared = meta.rowCount ?? 0

  return { tgLinksPurged, outboxMetaCleared, intentsPurged }
}

export const gdprPurgeTask = {
  slug: 'gdpr-purge',
  label: 'GDPR nightly purge — TgLink 90d, outbox meta 30d (spec 004 FR-404)',
  schedule: [{ cron: '0 3 * * *', queue: 'default' }],
  retries: 3,
  handler: async ({ req }: { req: { payload: Payload } }) => {
    const result = await runGdprPurge(req.payload)
    return { output: result, state: 'succeeded' as const }
  },
}
