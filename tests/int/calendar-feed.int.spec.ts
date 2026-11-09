import { sql } from '@payloadcms/db-postgres'
import { getPayload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import configPromise from '@payload-config'

import { buildFeed, foldLine, mapStatus } from '@/lib/calendar/ics'
import { resetBookingTables } from './helpers/reset003'

/**
 * Calendar Feed (spec 005 TC-005-001..010): RFC 5545 structure, escape/folding,
 * status matrix (incl. UNDERPAID → TENTATIVE), PII boundary, determinism with
 * frozen clock (re-check R4).
 */

const payload = await getPayload({ config: configPromise })

beforeAll(async () => {
  await resetBookingTables(payload)
  await payload.create({
    collection: 'resources',
    data: { name: 'Feed Master', active: true },
    overrideAccess: true,
  })
})

const FROZEN_NOW = new Date('2026-11-09T12:00:00.000Z')

const baseBooking = (overrides: Partial<Parameters<typeof buildFeed>[0]['bookings'][number]> = {}) => ({
  reservationId: 1,
  status: 'BOOKED',
  startTime: '2026-12-01T10:00:00.000Z',
  endTime: '2026-12-01T11:00:00.000Z',
  updatedAt: '2026-11-08T09:30:00.000Z',
  serviceName: 'Стрижка',
  customerName: 'Иван',
  ...overrides,
})

describe('T510 — RFC 5545 writer (FR-502, TC-005-004..006)', () => {
  it('structure: PRODID/VERSION, CRLF invariant (no bare \\n), stable UID, UTC Z timestamps', () => {
    const body = buildFeed({ resourceName: 'Feed Master', host: 'shop.example', bookings: [baseBooking()], now: FROZEN_NOW })
    expect(body).toContain('VERSION:2.0')
    expect(body).toContain('PRODID:-//UnderUndre//undreseller//EN')
    expect(body).toContain('METHOD:PUBLISH')
    expect(body).toContain(`UID:booking-1@shop.example`)
    expect(body).toContain('DTSTART:20261201T100000Z')
    expect(body).toContain('DTEND:20261201T110000Z')
    expect(body).toContain('DTSTAMP:20261108T093000Z') // updated_at — byte-determinism (D3)
    expect(body).not.toMatch(/(?<!\r)\n/) // no bare LF
    expect(body.endsWith('\r\n')).toBe(true)
  })

  it('escape matrix: `,` `;` `\\` newline are RFC-escaped (TC-005-005)', () => {
    const body = buildFeed({
      resourceName: 'Feed',
      host: 'shop.example',
      bookings: [
        baseBooking({ serviceName: 'Массаж, спа; "люкс"', customerName: 'Анна\nвторая строка \\ тест' }),
      ],
      now: FROZEN_NOW,
    })
    const unfoldedEscape = body.replace(/\r\n /g, '')
    expect(unfoldedEscape).toContain('SUMMARY:Массаж\\, спа\\; "люкс" — Анна\\nвторая строка \\\\ тест')
  })

  it('line folding > 75 octets is UTF-8 safe (no split code points)', () => {
    const longName = 'ОченьДлинноеИмяКлиента'.repeat(12) // multi-byte heavy
    const folded = foldLine(`SUMMARY:${longName}`)
    for (const segment of folded.split('\r\n')) {
      const bytes = new TextEncoder().encode(segment).length
      expect(bytes).toBeLessThanOrEqual(75)
    }
    // Unfolding restores the original content (leading space stripped)
    const unfolded = folded.replace(/\r\n /g, '')
    expect(unfolded).toBe(`SUMMARY:${longName}`)
  })

  it('full status matrix incl. UNDERPAID → TENTATIVE (re-check R1, TC-005-006)', () => {
    expect(mapStatus('BOOKED')).toBe('CONFIRMED')
    expect(mapStatus('HELD')).toBe('TENTATIVE')
    expect(mapStatus('PAYMENT_PENDING')).toBe('TENTATIVE')
    expect(mapStatus('PENDING_APPROVAL')).toBe('TENTATIVE')
    expect(mapStatus('UNDERPAID')).toBe('TENTATIVE')
    expect(mapStatus('RELEASED')).toBe('CANCELLED')
    expect(mapStatus('CANCELLED')).toBe('CANCELLED')
    expect(mapStatus('STAFF_REJECTED')).toBe('CANCELLED')

    const body = buildFeed({
      resourceName: 'Feed',
      host: 'shop.example',
      bookings: [
        baseBooking({ reservationId: 1, status: 'BOOKED' }),
        baseBooking({ reservationId: 2, status: 'UNDERPAID' }),
        baseBooking({ reservationId: 3, status: 'CANCELLED' }),
      ],
      now: FROZEN_NOW,
    })
    expect(body).toContain('STATUS:CONFIRMED')
    expect(body).toContain('STATUS:TENTATIVE')
    expect(body).toContain('STATUS:CANCELLED')
    // Cancelled event carries SEQUENCE:1
    expect(body).toMatch(/STATUS:CANCELLED\r\nSEQUENCE:1/)
  })

  it('determinism with frozen clock + window edges (re-check R4)', () => {
    const bookings = [baseBooking(), baseBooking({ reservationId: 2, startTime: '2026-12-02T10:00:00.000Z', endTime: '2026-12-02T11:00:00.000Z' })]
    const a = buildFeed({ resourceName: 'Feed', host: 'h', bookings, now: FROZEN_NOW })
    const b = buildFeed({ resourceName: 'Feed', host: 'h', bookings, now: FROZEN_NOW })
    expect(a).toBe(b) // byte-identical
    // Booking outside the window (older than 7d) is excluded
    const outside = buildFeed({
      resourceName: 'Feed',
      host: 'h',
      bookings: [baseBooking({ startTime: '2026-10-01T10:00:00.000Z', endTime: '2026-10-01T11:00:00.000Z' })],
      now: FROZEN_NOW,
    })
    expect(outside).not.toContain('SUMMARY:Стрижка')
  })

  it('empty resource → valid empty VCALENDAR (200-semantics, no 404)', () => {
    const body = buildFeed({ resourceName: 'Feed', host: 'h', bookings: [], now: FROZEN_NOW })
    expect(body).toContain('BEGIN:VCALENDAR')
    expect(body).toContain('END:VCALENDAR')
    expect(body).not.toContain('BEGIN:VEVENT')
  })

  it('PII boundary: SUMMARY fallbacks, no phone/email possible (TC-005-007)', () => {
    const body = buildFeed({
      resourceName: 'Feed',
      host: 'h',
      bookings: [baseBooking({ serviceName: null, customerName: null })],
      now: FROZEN_NOW,
    })
    expect(body).toContain('SUMMARY:Запись — Клиент') // review F9 fallbacks
    expect(body).not.toContain('+7')
    // '@' appears only in the canonical UID — no email/contact surface exists.
    const withoutUid = body.replace(/UID:[^\r\n]+\r\n/g, '')
    expect(withoutUid).not.toContain('@')
    expect(body).not.toContain('DESCRIPTION') // review F9: field omitted entirely
  })
})

// ---------------------------------------------------------------------------
// Route-level tests (T520/T521): real handlers via NextRequest — 403 matrix,
// ETag/304, HEAD, rate-limit bucket separation, rotate token lifecycle.
// ---------------------------------------------------------------------------

import { NextRequest } from 'next/server'

const routeGet = async (resourceId: string, token: string, extraHeaders: Record<string, string> = {}) => {
  const { GET } = await import('@/app/api/calendar/feed/[resourceId]/route')
  const req = new NextRequest(
    new Request(`http://localhost:3000/api/calendar/feed/${resourceId}?token=${token}`, { headers: extraHeaders }),
  )
  return GET(req, { params: Promise.resolve({ resourceId }) })
}

const routeHead = async (resourceId: string, token: string) => {
  const { HEAD } = await import('@/app/api/calendar/feed/[resourceId]/route')
  const req = new NextRequest(new Request(`http://localhost:3000/api/calendar/feed/${resourceId}?token=${token}`))
  return HEAD(req, { params: Promise.resolve({ resourceId }) })
}

describe('T520/T521 — route contract (FR-501/504, TC-005-001..003, 008..009)', () => {
  let resourceId = ''
  let token = ''

  beforeAll(async () => {
    const resource = await payload.create({
      collection: 'resources',
      data: { name: 'Route Master', active: true },
      overrideAccess: true,
    })
    resourceId = String(resource.id)
    const { computeFeedToken } = await import('@/lib/calendar/feedToken')
    token = computeFeedToken(resourceId, 1)
  })

  it('403 matrix: wrong token / unknown resource → FEED_FORBIDDEN (TC-005-001)', async () => {
    const wrong = await routeGet(resourceId, 'bogus-token')
    expect(wrong.status).toBe(403)
    const unknown = await routeGet('999999', token)
    expect(unknown.status).toBe(403)
  })

  it('valid token → 200 text/calendar with booking; ETag/304 + HEAD (TC-005-008)', async () => {
    const svc = await payload.create({
      collection: 'products',
      data: { title: 'Feed Svc', slug: `feed-svc-${Date.now()}`, bookable: true, durationMin: 60, priceInUSD: 10, layout: [] },
      overrideAccess: true,
    })
    await createBooking(payload, {
      productId: String(svc.id),
      start: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      customerName: 'FeedUser',
      customerPhone: '+70000007000',
    })

    const ok = await routeGet(resourceId, token)
    expect(ok.status).toBe(200)
    expect(ok.headers.get('content-type')).toContain('text/calendar')
    const etag = ok.headers.get('etag')
    expect(etag).toMatch(/^W\/"/)
    const body = await ok.text()
    expect(body).toContain('Feed Svc — FeedUser')

    // Conditional request → 304, empty body
    const cached = await routeGet(resourceId, token, { 'if-none-match': etag as string })
    expect(cached.status).toBe(304)
    expect(await cached.text()).toBe('')

    // HEAD → 200, headers only
    const head = await routeHead(resourceId, token)
    expect(head.status).toBe(200)
    expect(head.headers.get('etag')).toBe(etag)
    expect(await head.text()).toBe('')
  })

  it('rate limit: 30/60s bucket is per resource+IP — other resource unaffected (review F1, TC-005-002)', async () => {
    // Exhaust the bucket for resourceId
    for (let i = 0; i < 30; i++) await routeGet(resourceId, token)
    const blocked = await routeGet(resourceId, token)
    expect(blocked.status).toBe(429)

    const resource2 = await payload.create({
      collection: 'resources',
      data: { name: 'Route Master 2', active: true },
      overrideAccess: true,
    })
    const { computeFeedToken: compute2 } = await import('@/lib/calendar/feedToken')
    const token2 = compute2(String(resource2.id), 1)
    const other = await routeGet(String(resource2.id), token2)
    expect(other.status).toBe(200) // different bucket — not cross-blocked
  })

  it('rotate: version++ invalidates old token (TC-005-009) — own resource (rate-limit bucket isolation)', async () => {
    const db: any = payload.db
    const resource3 = await payload.create({
      collection: 'resources',
      data: { name: 'Rotate Master', active: true },
      overrideAccess: true,
    })
    const rid = String(resource3.id)
    const { computeFeedToken } = await import('@/lib/calendar/feedToken')
    const oldToken = computeFeedToken(rid, 1)

    await db.execute({
      drizzle: db.drizzle,
      sql: sql`UPDATE resources SET feed_token_version = 2 WHERE id = ${rid}`,
    })
    const stale = await routeGet(rid, oldToken)
    expect(stale.status).toBe(403)
    const fresh = await routeGet(rid, computeFeedToken(rid, 2))
    expect(fresh.status).toBe(200)
  })
})

// createBooking import is used inside the route test block (hoisted at module top-level import order)
import { createBooking } from '@/lib/booking/bookingService'
