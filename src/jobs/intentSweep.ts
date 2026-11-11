import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

/**
 * Intent lifecycle sweep (spec 007 US4, T731, review F10): every 5 minutes —
 * ONLY the pending→expired transition for intents whose code TTL ran out.
 * Retention purge (dead/expired 30d, consumed 90d — review F7) is delegated
 * to the nightly GDPR purge, never done here.
 */

export interface IntentSweepResult {
  expired: number
}

export async function runIntentSweep(payload: Payload): Promise<IntentSweepResult> {
  const db: any = payload.db
  const expired = await db.execute({
    drizzle: db.drizzle,
    sql: sql`UPDATE booking_intents SET status = 'expired', updated_at = now()
             WHERE status = 'pending' AND expires_at < now()
             RETURNING id`,
  })
  for (const raw of (expired.rows ?? []) as Array<{ id: number }>) {
    await db.execute({
      drizzle: db.drizzle,
      sql: sql`INSERT INTO audit_events (action, actor_id, aggregate_type, aggregate_id, metadata_json, created_at, updated_at)
               VALUES ('intent.expired', 'SYSTEM', 'INTENT', ${String(raw.id)}, '{}'::jsonb, now(), now())`,
    })
  }
  return { expired: (expired.rows ?? []).length }
}

export const intentSweepTask = {
  slug: 'intent-sweep',
  label: 'Intent lifecycle sweep — 5m, pending→expired only (spec 007 FR-705, review F10)',
  schedule: [{ cron: '*/5 * * * *', queue: 'default' }],
  retries: 3,
  // Runtime contract verified in payload 3.93 dist: { inlineTask, input, job, req, tasks }.
  handler: async ({ req }: { req: { payload: Payload } }) => {
    const result = await runIntentSweep(req.payload)
    return { output: result, state: 'succeeded' as const }
  },
}
