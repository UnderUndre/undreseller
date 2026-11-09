import { createHash } from 'node:crypto'
import { sql } from '@payloadcms/db-postgres'
import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'

import configPromise from '@payload-config'

import { buildFeed, type FeedBooking } from '@/lib/calendar/ics'
import { computeFeedToken, verifyFeedToken } from '@/lib/calendar/feedToken'
import { checkRateLimit, clientIpFrom } from '@/lib/security/rateLimiter'

/**
 * Calendar feed endpoint (spec 005 T520, US1/US2, FR-501..503):
 * GET + HEAD (review F3), per-resource+IP rate limit 30/60s (review F1 —
 * crawler egress IPs poll multiple resources), ETag/304 conditional caching
 * (review F2), timing-safe computed HMAC token, PII boundary (no phones, no
 * DESCRIPTION, body never logged — NFR-504).
 */

const WINDOW_DAYS_BACK = 7
const WINDOW_DAYS_AHEAD = 90

async function handle(
  req: NextRequest,
  context: { params: Promise<{ resourceId: string }> },
  method: 'GET' | 'HEAD',
): Promise<NextResponse> {
  const ip = clientIpFrom(req)
  const { resourceId } = await context.params

  // Review F1: bucket includes the resource — one crawler IP polling many
  // calendars never cross-blocks them.
  const rl = checkRateLimit(`feed:${resourceId}:${ip}`, 30, 60_000)
  if (!rl.allowed) {
    return new NextResponse(null, {
      status: 429,
      headers: { 'Retry-After': String(rl.retryAfterSec) },
    })
  }

  const token = req.nextUrl.searchParams.get('token') ?? ''
  const payload = await getPayload({ config: configPromise })
  const version = await payload.db
    .execute({
      drizzle: (payload.db as any).drizzle,
      sql: sql`SELECT COALESCE(feed_token_version, 1) AS v, name FROM resources WHERE id = ${resourceId} LIMIT 1`,
    })
    .then((r: any) => r.rows?.[0] as { v: number | string; name: string } | undefined)
    .catch(() => undefined)

  if (!version) {
    return NextResponse.json({ error: 'FEED_FORBIDDEN' }, { status: 403 })
  }
  if (!verifyFeedToken(resourceId, Number(version.v), token)) {
    return NextResponse.json({ error: 'FEED_FORBIDDEN' }, { status: 403 })
  }

  // Booking window: now−7d … now+90d (tests freeze the clock — re-check R4).
  const now = new Date()
  const windowStart = new Date(now.getTime() - WINDOW_DAYS_BACK * 24 * 60 * 60 * 1000)
  const windowEnd = new Date(now.getTime() + WINDOW_DAYS_AHEAD * 24 * 60 * 60 * 1000)

  const rows = await payload.db
    .execute({
      drizzle: (payload.db as any).drizzle,
      sql: sql`SELECT sr.id, sr.status, sr.start_time, sr.end_time, sr.updated_at,
                      p.title AS service_title, sr.customer_name
               FROM slot_reservations sr
               LEFT JOIN products p ON p.id::text = sr.item_id
               WHERE sr.resource_id = ${resourceId}
                 AND sr.start_time >= ${windowStart.toISOString()}
                 AND sr.start_time <= ${windowEnd.toISOString()}
               ORDER BY sr.start_time ASC`,
    })
    .then((r: any) => r.rows ?? [])

  const bookings: FeedBooking[] = (rows as Array<Record<string, unknown>>).map((r) => ({
    reservationId: Number(r.id),
    status: String(r.status),
    startTime: String(r.start_time),
    endTime: String(r.end_time),
    updatedAt: String(r.updated_at),
    serviceName: r.service_title ? String(r.service_title) : null,
    customerName: r.customer_name ? String(r.customer_name) : null,
  }))

  const host = req.nextUrl.host
  const icsBody = buildFeed({
    resourceName: version.name ?? '',
    host,
    bookings,
    now,
  })

  const etag = `W/"${createHash('sha256').update(icsBody).digest('hex').slice(0, 32)}"`
  const headers: Record<string, string> = {
    'Content-Type': 'text/calendar; charset=utf-8',
    'Cache-Control': 'private, max-age=300, must-revalidate',
    ETag: etag,
  }

  if (req.headers.get('if-none-match') === etag) {
    // Review F2: instant 304 — 0 bytes, < 5 ms.
    return new NextResponse(null, { status: 304, headers })
  }

  // HEAD: headers without the body (review F3).
  if (method === 'HEAD') {
    return new NextResponse(null, { status: 200, headers })
  }

  return new NextResponse(icsBody, { status: 200, headers })
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ resourceId: string }> },
): Promise<NextResponse> {
  return handle(req, context, 'GET')
}

export async function HEAD(
  req: NextRequest,
  context: { params: Promise<{ resourceId: string }> },
): Promise<NextResponse> {
  return handle(req, context, 'HEAD')
}
