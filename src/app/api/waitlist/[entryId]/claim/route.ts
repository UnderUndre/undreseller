import { sql } from '@payloadcms/db-postgres'
import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'

import configPromise from '@payload-config'

import { createBooking } from '@/lib/booking/bookingService'
import { verifyClaimToken } from '@/lib/waitlist/claimToken'
import { WaitlistError } from '@/lib/waitlist/waitlistService'
import { checkRateLimit, clientIpFrom } from '@/lib/security/rateLimiter'

/**
 * Waitlist claim (spec 006 US3, FR-603 — Risk 20): the FIRST confirmed client
 * wins the freed slot via FSM CREATE_BOOKING (FREE → CONFIRMED, PREPAID →
 * HELD 15m). Slot time is read STRICTLY from the DB row (review F1); losers
 * get an honest 409 and re-arm (review F4 — no auto-advance on a taken slot).
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ entryId: string }> },
): Promise<NextResponse> {
  const ip = clientIpFrom(req)
  const rl = checkRateLimit(`waitlist-claim:${ip}`)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'RATE_LIMITED', retryAfterSec: rl.retryAfterSec },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    )
  }

  const { entryId } = await context.params
  const token = req.nextUrl.searchParams.get('token') ?? ''
  let body: Record<string, unknown> = {}
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    // body optional
  }
  const idempotencyKey =
    typeof body.idempotencyKey === 'string' && body.idempotencyKey
      ? body.idempotencyKey
      : `waitlist-claim-${entryId}-${token.slice(0, 16)}`

  const payload = await getPayload({ config: configPromise })
  const db: any = payload.db

  const entryRes = await db.execute({
    drizzle: db.drizzle,
    sql: sql`SELECT id, status, campaign_count, active_campaign_at, notified_slot_start, notified_slot_end,
                    customer_name, customer_phone, customer_email, service_id_id AS service_id, resource_id_id AS resource_id
             FROM waitlist_entries WHERE id = ${entryId} LIMIT 1`,
  })
  const entry = entryRes.rows?.[0] as
    | {
        id: number
        status: string
        campaign_count: number
        active_campaign_at: string | null
        notified_slot_start: string | null
        notified_slot_end: string | null
        customer_name: string
        customer_phone: string
        customer_email: string
        service_id: string | number
        resource_id: string | number
      }
    | undefined
  if (!entry) {
    return NextResponse.json({ error: 'WAITLIST_NOT_FOUND' }, { status: 404 })
  }
  if (entry.status === 'converted' || entry.status === 'cancelled' || entry.status === 'expired') {
    return NextResponse.json({ error: 'WAITLIST_TOKEN_INVALID' }, { status: 403 })
  }
  if (entry.status !== 'notified' || !entry.notified_slot_start || !entry.notified_slot_end || !entry.active_campaign_at) {
    return NextResponse.json({ error: 'WAITLIST_TOKEN_INVALID' }, { status: 403 })
  }
  // Campaign TTL: 30 minutes (review F4 window).
  if (Date.now() - new Date(entry.active_campaign_at).getTime() > 30 * 60 * 1000) {
    return NextResponse.json({ error: 'WAITLIST_TOKEN_INVALID' }, { status: 403 })
  }
  const slotStartIso = new Date(entry.notified_slot_start).toISOString()
  if (!verifyClaimToken(entry.id, Number(entry.campaign_count), slotStartIso, token)) {
    return NextResponse.json({ error: 'WAITLIST_TOKEN_INVALID' }, { status: 403 })
  }

  // CAS: only the first claim of this campaign converts the entry.
  const cas = await db.execute({
    drizzle: db.drizzle,
    sql: sql`UPDATE waitlist_entries SET status = 'converted', updated_at = now()
             WHERE id = ${entry.id} AND status = 'notified' AND campaign_count = ${Number(entry.campaign_count)}
             RETURNING id`,
  })
  if ((cas.rows ?? []).length === 0) {
    return NextResponse.json({ error: 'WAITLIST_TOKEN_INVALID' }, { status: 403 })
  }

  try {
    const booking = await createBooking(payload, {
      productId: String(entry.service_id),
      resourceId: entry.resource_id,
      start: new Date(entry.notified_slot_start).toISOString(),
      customerName: entry.customer_name,
      customerPhone: entry.customer_phone,
      customerEmail: entry.customer_email,
      idempotencyKey: `waitlist-claim-${entry.id}-${entry.campaign_count}-${slotStartIso}`.slice(0, 100),
    })
    // Re-arm the co-candidates of the same campaign (they lost fairly).
    await db.execute({
      drizzle: db.drizzle,
      sql: sql`UPDATE waitlist_entries SET status = 'waiting', active_campaign_at = NULL,
               notified_slot_start = NULL, notified_slot_end = NULL, updated_at = now()
               WHERE id <> ${entry.id} AND status = 'notified'
                 AND notified_slot_start = ${entry.notified_slot_start}
                 AND resource_id_id = ${entry.resource_id}`,
    })
    await db.execute({
      drizzle: db.drizzle,
      sql: sql`INSERT INTO audit_events (action, actor_id, aggregate_type, aggregate_id, metadata_json, created_at, updated_at)
               VALUES ('waitlist.converted', 'CUSTOMER', 'WAITLIST', ${String(entry.id)},
                       ${JSON.stringify({ reservationId: booking.reservationId })}::jsonb, now(), now())`,
    })
    return NextResponse.json(booking, { status: 201 })
  } catch (err: unknown) {
    // Honest re-arm on any booking failure (review F4: no auto-advance on 409).
    await db
      .execute({
        drizzle: db.drizzle,
        sql: sql`UPDATE waitlist_entries SET status = 'waiting', active_campaign_at = NULL, updated_at = now()
                 WHERE id = ${entry.id} AND status = 'converted'`,
      })
      .catch(() => undefined)
    if (err instanceof WaitlistError) {
      return NextResponse.json({ error: err.code, message: err.message }, { status: err.status })
    }
    const code = (err as { code?: string }).code ?? (err as { cause?: { code?: string } })?.cause?.code
    if (code === '23P01') {
      return NextResponse.json({ error: 'SLOT_TAKEN', message: 'Слот уже занят' }, { status: 409 })
    }
    if (err instanceof Error && err.message.includes('SLOT_TAKEN')) {
      return NextResponse.json({ error: 'SLOT_TAKEN', message: 'Слот уже занят' }, { status: 409 })
    }
    return NextResponse.json({ error: 'INTERNAL' }, { status: 500 })
  }
}
