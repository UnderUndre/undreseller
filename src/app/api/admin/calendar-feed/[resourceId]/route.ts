import { sql } from '@payloadcms/db-postgres'
import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'

import configPromise from '@payload-config'

import { hasMinimumRole } from '@/access/roles'
import { computeFeedToken, webcalUrl } from '@/lib/calendar/feedToken'

/**
 * Owner surface for the calendar feed (spec 005 T521, US3, FR-504):
 * GET → current webcal URL; POST → rotate (version++ + audit). OWNER-only
 * (adminOnly canon — OPERATOR has no /admin-adjacent surfaces).
 */
async function authorize(req: NextRequest): Promise<string | null> {
  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({ headers: req.headers })
  if (!user || !hasMinimumRole(user?.roles, 'OWNER')) return null
  return String(user.id)
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ resourceId: string }> },
): Promise<NextResponse> {
  const actorId = await authorize(req)
  if (!actorId) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })

  const { resourceId } = await context.params
  const payload = await getPayload({ config: configPromise })
  const db: any = payload.db
  const res = await db.execute({
    drizzle: db.drizzle,
    sql: sql`SELECT COALESCE(feed_token_version, 1) AS v FROM resources WHERE id = ${resourceId} LIMIT 1`,
  })
  const row = res.rows?.[0] as { v: number | string } | undefined
  if (!row) return NextResponse.json({ error: 'RESOURCE_NOT_FOUND' }, { status: 404 })

  const version = Number(row.v) || 1
  const token = computeFeedToken(resourceId, version)
  return NextResponse.json({ webcalUrl: webcalUrl(req.nextUrl.host, resourceId, token), version })
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ resourceId: string }> },
): Promise<NextResponse> {
  const actorId = await authorize(req)
  if (!actorId) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })

  const { resourceId } = await context.params
  const payload = await getPayload({ config: configPromise })
  const db: any = payload.db

  const rotated = await db.drizzle.transaction(async (trx: any) => {
    const cas = await trx.execute(
      sql`UPDATE resources SET feed_token_version = COALESCE(feed_token_version, 1) + 1, updated_at = now()
          WHERE id = ${resourceId}
          RETURNING feed_token_version`,
    )
    if (cas.rows.length === 0) return null
    const newVersion = Number((cas.rows[0] as { feed_token_version: number }).feed_token_version)
    await trx.execute(
      sql`INSERT INTO audit_events (action, actor_id, aggregate_type, aggregate_id, metadata_json, created_at, updated_at)
          VALUES ('calendar.feed-rotated', ${actorId}, 'RESOURCE', ${resourceId},
                  ${JSON.stringify({ previousVersion: newVersion - 1, newVersion })}::jsonb, now(), now())`,
    )
    return newVersion
  })

  if (rotated === null) {
    return NextResponse.json({ error: 'RESOURCE_NOT_FOUND' }, { status: 404 })
  }
  const token = computeFeedToken(resourceId, rotated)
  return NextResponse.json({ webcalUrl: webcalUrl(req.nextUrl.host, resourceId, token), version: rotated })
}
