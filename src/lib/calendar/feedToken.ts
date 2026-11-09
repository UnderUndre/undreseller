import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import { hashToken, verifyTokenHash } from '@/lib/booking/tokens'

/**
 * Versioned calendar-feed token (spec 005 T511, research D2): computed HMAC —
 * nothing secret stored in the DB; rotation = `feedTokenVersion` increment,
 * which instantly invalidates every previously issued URL (FR-504).
 */

function tokenMaterial(resourceId: string | number, version: number): string {
  return `calendar-feed:v${version}:${resourceId}`
}

export function computeFeedToken(resourceId: string | number, version: number): string {
  return hashToken(tokenMaterial(resourceId, version))
}

export function verifyFeedToken(
  resourceId: string | number,
  version: number,
  providedToken: string | null | undefined,
): boolean {
  if (!providedToken) return false
  return verifyTokenHash(tokenMaterial(resourceId, version), providedToken)
}

/** Current token version for the resource (missing field / row → v1 default). */
export async function getFeedTokenVersion(payload: Payload, resourceId: string): Promise<number> {
  const db: any = payload.db
  const res = await db.execute({
    drizzle: db.drizzle,
    sql: sql`SELECT COALESCE(feed_token_version, 1) AS v FROM resources WHERE id = ${resourceId} LIMIT 1`,
  })
  const row = res.rows?.[0] as { v: number | string } | undefined
  if (!row) return 0 // unknown resource — no version can validate
  return Number(row.v) || 1
}

export function webcalUrl(host: string, resourceId: string | number, token: string): string {
  const cleanHost = host.replace(/\/$/, '')
  return `webcal://${cleanHost}/api/calendar/feed/${resourceId}?token=${token}`
}
