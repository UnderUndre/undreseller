import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import { evaluateHoldExpiry } from '@/lib/kernel/bookingFsm'

/**
 * Hold sweep (spec 003 US5, research D1): releases expired PREPAID holds.
 * Registered as a Payload Job with a minute-ly cron; the framework's
 * DB-backed lease prevents double-run across restarts, and the CAS update makes
 * each release idempotent (a sweep re-run is a no-op).
 */

export interface HoldSweepResult {
  released: number
}

export async function releaseExpiredHolds(payload: Payload): Promise<HoldSweepResult> {
  const db: any = payload.db
  const candidates = await db.execute({
    drizzle: db.drizzle,
    sql: sql`SELECT id, status, schedule_version, order_id, hold_expires_at, hold_frozen_at
             FROM slot_reservations
             WHERE status IN ('HELD', 'PAYMENT_PENDING') AND hold_expires_at IS NOT NULL`,
  })
  const now = new Date()
  let released = 0

  for (const raw of (candidates.rows ?? []) as Array<{
    id: number
    status: string
    schedule_version: number
    order_id: number
    hold_expires_at: string | null
    hold_frozen_at: string | null
  }>) {
    const verdict = evaluateHoldExpiry({
      status: raw.status as 'HELD' | 'PAYMENT_PENDING',
      holdExpiresAt: raw.hold_expires_at ? new Date(raw.hold_expires_at) : null,
      holdFrozenAt: raw.hold_frozen_at ? new Date(raw.hold_frozen_at) : null,
      now,
    })
    if (verdict !== 'EXPIRED' && verdict !== 'FREEZE_CEILING_EXCEEDED') continue

    await db.drizzle.transaction(async (trx: any) => {
      await trx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext('resource_slot_cancel_' || ${raw.id}))`,
      )
      const cas = await trx.execute(sql`
        UPDATE slot_reservations
        SET status = 'RELEASED', schedule_version = schedule_version + 1, updated_at = now()
        WHERE id = ${raw.id} AND status = ${raw.status} AND schedule_version = ${raw.schedule_version}
        RETURNING id`)
      if (cas.rows.length === 0) return
      await trx.execute(
        sql`UPDATE orders SET status = 'cancelled', updated_at = now() WHERE id = ${raw.order_id}`,
      )
      await trx.execute(sql`
        INSERT INTO audit_events (action, actor_id, aggregate_type, aggregate_id, metadata_json, created_at, updated_at)
        VALUES ('booking.hold-expired', 'SYSTEM', 'BOOKING', ${String(raw.id)}, '{}'::jsonb, now(), now())`)
      released += 1
    })
  }

  return { released }
}

export const holdSweepTask = {
  slug: 'hold-sweep',
  label: 'Release expired PREPAID holds (TTL 15m, spec 003 FR-302/307)',
  schedule: [{ cron: '*/1 * * * *', queue: 'default' }],
  retries: 3,
  // Runtime contract verified in payload 3.93 dist (getRunTaskFunction.js):
  // handlers receive { inlineTask, input, job, req, tasks } — payload via req.
  handler: async ({ req }: { req: { payload: Payload } }) => {
    const result = await releaseExpiredHolds(req.payload)
    return { output: result, state: 'succeeded' as const }
  },
}
