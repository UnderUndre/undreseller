import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

/**
 * Honeypot server-side canon (spec 007 US2 / FR-703, research D5): a filled
 * hidden field ("companyWebsite") identifies a bot → SILENT 200 stub with
 * ZERO domain effects + an audit row per hit. The response must not leak any
 * signal a bot could fingerprint (no 4xx, no error codes).
 */

export const HONEYPOT_FIELD = 'companyWebsite'

/** True when the honeypot field came back filled (bots only — humans never see it). */
export function honeypotFilled(body: Record<string, unknown>): boolean {
  const v = body[HONEYPOT_FIELD]
  return typeof v === 'string' && v.trim().length > 0
}

/** Audit `honeypot.hit` (best-effort — the silent reject must never throw). */
export async function auditHoneypotHit(payload: Payload, route: 'booking' | 'waitlist'): Promise<void> {
  try {
    const db: any = payload.db
    await db.execute({
      drizzle: db.drizzle,
      sql: sql`INSERT INTO audit_events (action, actor_id, aggregate_type, aggregate_id, metadata_json, created_at, updated_at)
               VALUES ('honeypot.hit', 'SYSTEM', ${route === 'booking' ? 'BOOKING' : 'WAITLIST'}, 'honeypot',
                       ${JSON.stringify({ route })}::jsonb, now(), now())`,
    })
  } catch (err: unknown) {
    payload.logger.error({ err, message: 'honeypot audit write failed' })
  }
}
