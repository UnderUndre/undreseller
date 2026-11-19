import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

/**
 * Booking e2e fixture canon (spec 015 FR-1506, T1503):
 * - rate-limit isolation: unique RFC 5737 TEST-NET-3 `x-forwarded-for` per
 *   BrowserContext (fix AG-F3) — independent buckets without touching the
 *   prod rateLimiter;
 * - determinism on the shared dev DB: unique future DATES per test (fix
 *   AG-F4.2 — the browser UI works at day granularity and `nowMin` only cuts
 *   today's slots), weekly-hours 09:00–18:00 for ALL 7 weekdays on the active
 *   default resource, unique slugs via Payload Local API, targeted `cleanup()`
 *   by ID (no TRUNCATE — Via Negativa).
 */

// ---------------------------------------------------------------------------
// Rate-limit isolation (fix AG-F3)
// ---------------------------------------------------------------------------

let xffCursor = 10
export function uniqueXffHeaders(): Record<string, string> {
  const ip = `203.0.113.${xffCursor++}`
  return { 'x-forwarded-for': ip }
}

// ---------------------------------------------------------------------------
// Deterministic dates (fix AG-F4.2)
// ---------------------------------------------------------------------------

let dateCursor = 0
/**
 * Unique far-future date per call: 30–90+ days out — beyond any bookings left
 * by previous runs (fix AG-F4.2/F4.4: retried runs tiled near-term dates
 * completely, and `nowMin`/full-day grids made them legitimately empty).
 */
export function uniqueFutureDate(minOffsetDays = 30): string {
  dateCursor += 1
  const offset = minOffsetDays + dateCursor + Math.floor(Math.random() * 30)
  return new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10)
}

// ---------------------------------------------------------------------------
// Resources & weekly hours (fix AG-F4.2: all 7 weekdays covered)
// ---------------------------------------------------------------------------

export async function getDefaultResourceId(payload: Payload): Promise<string> {
  const active = await payload.find({
    collection: 'resources',
    where: { active: { equals: true } },
    limit: 1,
    overrideAccess: true,
    depth: 0,
  })
  if (!active.docs[0]) throw new Error('No active booking resource — seed one first')
  return String(active.docs[0].id)
}

const ensuredHours = new Set<string>()
export async function ensureWeeklyHoursAllWeek(payload: Payload, resourceId: string): Promise<void> {
  const rid = Number(resourceId)
  for (const weekday of [1, 2, 3, 4, 5, 6, 7]) {
    const key = `${rid}:${weekday}`
    if (ensuredHours.has(key)) continue
    const existing = await payload.find({
      collection: 'weekly-hours',
      where: { and: [{ resourceId: { equals: rid } }, { weekday: { equals: weekday } }] },
      limit: 1,
      overrideAccess: true,
      depth: 0,
    })
    if (existing.docs.length === 0) {
      await payload.create({
        collection: 'weekly-hours',
        data: { resourceId: rid, weekday, startMin: 540, endMin: 1080 },
        overrideAccess: true,
      })
    }
    ensuredHours.add(key)
  }
}

// ---------------------------------------------------------------------------
// Service seeding (unique slugs — never collide with storefront data)
// ---------------------------------------------------------------------------

export interface SeedServiceOptions {
  durationMin?: number
  price?: number
  mode?: 'NONE' | 'FULL_PREPAYMENT' | 'DEPOSIT'
  deposit?: number
  addOn?: boolean
  outCall?: boolean
  title?: string
}

export interface SeededService {
  id: string
  title: string
  slug: string
}

let svcSeq = 0
const seededProductIds: string[] = []

export async function seedService(payload: Payload, opts: SeedServiceOptions = {}): Promise<SeededService> {
  svcSeq += 1
  const title = opts.title ?? `E2E Svc ${svcSeq}`
  const slug = `svc-e2e-${Date.now()}-${svcSeq}-${Math.random().toString(36).slice(2, 8)}`
  const product = await payload.create({
    collection: 'products',
    data: {
      title,
      slug,
      bookable: true,
      durationMin: opts.durationMin ?? 60,
      priceInUSD: opts.price ?? (opts.addOn ? 0 : 50),
      addOn: opts.addOn ?? false,
      ...(opts.outCall ? { outCallEnabled: true } : {}),
      paymentMode: opts.mode ?? 'NONE',
      ...(opts.mode === 'DEPOSIT' ? { depositAmount: opts.deposit ?? 10 } : {}),
      cancellationCutoffHours: 3,
      layout: [],
    },
    overrideAccess: true,
  })
  seededProductIds.push(String(product.id))
  return { id: String(product.id), title, slug }
}

// ---------------------------------------------------------------------------
// Booking tracking + targeted cleanup (fix AG-F4.4 — no TRUNCATE)
// ---------------------------------------------------------------------------

const createdReservationIds: string[] = []
const createdOrderIds: string[] = []

export function trackBooking(reservationId: number | string, orderId: number | string): void {
  createdReservationIds.push(String(reservationId))
  createdOrderIds.push(String(orderId))
}

export async function cleanupSeedData(payload: Payload): Promise<void> {
  for (const id of createdReservationIds) {
    await payload.delete({ collection: 'slot-reservations', id, overrideAccess: true }).catch((e: unknown) =>
      console.log('[seed-booking] reservation delete failed:', id, e instanceof Error ? e.message.slice(0, 120) : e),
    )
  }
  createdReservationIds.length = 0
  for (const id of createdOrderIds) {
    await payload.delete({ collection: 'orders', id, overrideAccess: true }).catch((e: unknown) =>
      console.log('[seed-booking] order delete failed:', id, e instanceof Error ? e.message.slice(0, 120) : e),
    )
  }
  createdOrderIds.length = 0
  // booking_intents hold NOT NULL FKs to products (ON DELETE SET NULL would
  // violate — PG 23502) — clear the e2e intents before removing services.
  // waitlist_entries hold the same NOT NULL product FK — sweep both.
  const db: any = payload.db
  await db
    .execute({
      drizzle: db.drizzle,
      sql: sql`DELETE FROM booking_intents WHERE email LIKE '%@example.com'`,
    })
    .catch((e: unknown) => console.log('[seed-booking] intent sweep failed:', e instanceof Error ? e.message.slice(0, 120) : e))
  await db
    .execute({
      drizzle: db.drizzle,
      sql: sql`DELETE FROM waitlist_entries WHERE customer_email LIKE '%@example.com'`,
    })
    .catch((e: unknown) => console.log('[seed-booking] waitlist sweep failed:', e instanceof Error ? e.message.slice(0, 120) : e))
  for (const id of seededProductIds) {
    await payload.delete({ collection: 'products', id, overrideAccess: true }).catch((e: unknown) =>
      console.log('[seed-booking] product delete failed:', id, e instanceof Error ? e.message.slice(0, 120) : e),
    )
  }
  seededProductIds.length = 0
}

/** Availability exception helper: a closed day = deterministic empty grid (waitlist UX). */
const createdExceptionIds: string[] = []
export async function seedClosedDay(payload: Payload, resourceId: string, date: string): Promise<void> {
  const exception = await payload.create({
    collection: 'availability-exceptions',
    data: { resourceId: Number(resourceId), date, isClosed: true },
    overrideAccess: true,
  })
  createdExceptionIds.push(String(exception.id))
}

export async function cleanupExceptions(payload: Payload): Promise<void> {
  for (const id of createdExceptionIds) {
    await payload.delete({ collection: 'availability-exceptions', id, overrideAccess: true }).catch(() => undefined)
  }
  createdExceptionIds.length = 0
}

/** Slot inventory probe: raw query helper for assertions on reservations/orders. */
export async function reservationRow(payload: Payload, reservationId: number | string): Promise<Record<string, unknown> | undefined> {
  const db: any = payload.db
  const res = await db.execute({
    drizzle: (payload.db as unknown as { drizzle: any }).drizzle,
    sql: sql`SELECT * FROM slot_reservations WHERE id = ${Number(reservationId)} LIMIT 1`,
  })
  return res.rows?.[0] as Record<string, unknown> | undefined
}

/**
 * Navigates to `/book/[slug]`, waits for client React hydration (the initial
 * `useEffect` availability fetch), then selects `date` and waits for its grid
 * response. Prevents dev-mode hydration races where `.fill(date)` hits the
 * uncontrolled SSR input before `onChange` attaches.
 */
export async function gotoBookingDate(
  page: import('@playwright/test').Page,
  slug: string,
  date: string,
): Promise<void> {
  await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/availability')),
    page.goto(`/book/${slug}`),
  ])
  await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/availability') && r.url().includes(date)),
    page.getByTestId('booking-date').fill(date),
  ])
}

/** Raw order probe (NUMERIC amount comes back as string). */
export async function orderRow(payload: Payload, orderId: number | string): Promise<{ id: number; status: string; amount: string } | undefined> {
  const db: any = payload.db
  const res = await db.execute({
    drizzle: (payload.db as unknown as { drizzle: any }).drizzle,
    sql: sql`SELECT id, status, amount FROM orders WHERE id = ${Number(orderId)} LIMIT 1`,
  })
  return res.rows?.[0] as { id: number; status: string; amount: string } | undefined
}

// ---------------------------------------------------------------------------
// 201 body capture (fix for body-read races: reading response.json() after
// the app navigates loses the body — route interception buffers it safely)
// ---------------------------------------------------------------------------

export interface CapturedBooking {
  reservationId: number
  orderId: number
  cancelToken: string
  rescheduleToken: string
  accessToken: string
  status: string
  items?: Array<{ productId: string; title: string; durationMin: number; priceInUSD: number; depositAmount: number; addOn: boolean }>
  totalDurationMin?: number
  totalPriceInUSD?: number
  totalDepositInUSD?: number
}

/**
 * Installs a passthrough route interceptor that buffers the FINAL 201 booking
 * response body. `state.last` is set before the app navigates to the
 * confirmation page — read it after `booking-confirmed` becomes visible.
 */
export function captureBookingPosts(page: import('@playwright/test').Page): { last: CapturedBooking | null } {
  const state: { last: CapturedBooking | null } = { last: null }
  void page.route('**/api/booking', async (route) => {
    try {
      const response = await route.fetch()
      if (route.request().method() === 'POST' && response.status() === 201) {
        try {
          state.last = (await response.json()) as CapturedBooking
        } catch {
          // body read failure must not break the app passthrough
        }
      }
      await route.fulfill({ response })
    } catch {
      await route.abort()
    }
  })
  return state
}
