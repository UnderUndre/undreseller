import { sql } from '@payloadcms/db-postgres'
import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'

import configPromise from '@payload-config'

import { verifyUnsubscribeToken } from '@/lib/waitlist/claimToken'
import { notifySlotFreed } from '@/lib/waitlist/waitlistService'

/** Unsubscribe (spec 006 US4, FR-605): unsubToken valid for the entry lifetime. */
export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ entryId: string }> },
): Promise<NextResponse> {
  const { entryId } = await context.params
  const token = req.nextUrl.searchParams.get('token') ?? ''

  const payload = await getPayload({ config: configPromise })
  const db: any = payload.db
  const res = await db.execute({
    drizzle: db.drizzle,
    sql: sql`SELECT id, status, resource_id, item_id, notified_slot_start, notified_slot_end
             FROM waitlist_entries WHERE id = ${entryId} LIMIT 1`,
  })
  const entry = res.rows?.[0] as
    | {
        id: number
        status: string
        resource_id: string | number
        item_id: string | null
        notified_slot_start: string | null
        notified_slot_end: string | null
      }
    | undefined
  if (!entry) return NextResponse.json({ error: 'WAITLIST_NOT_FOUND' }, { status: 404 })
  if (!verifyUnsubscribeToken(entry.id, token)) {
    return NextResponse.json({ error: 'WAITLIST_TOKEN_INVALID' }, { status: 403 })
  }
  if (entry.status === 'cancelled') {
    return NextResponse.json({ status: 'cancelled' })
  }

  await db.execute({
    drizzle: db.drizzle,
    sql: sql`UPDATE waitlist_entries SET status = 'cancelled', updated_at = now() WHERE id = ${entry.id}`,
  })
  await db.execute({
    drizzle: db.drizzle,
    sql: sql`INSERT INTO audit_events (action, actor_id, aggregate_type, aggregate_id, metadata_json, created_at, updated_at)
             VALUES ('waitlist.unsubscribed', 'CUSTOMER', 'WAITLIST', ${String(entry.id)}, '{}'::jsonb, now(), now())`,
  })

  // Review F4: unsubscribe releases the notified slot back to the queue —
  // auto-advance only if the slot is still in the future (slotFree check lives
  // in the match job + sweep).
  if (entry.status === 'notified' && entry.notified_slot_start) {
    const start = new Date(entry.notified_slot_start)
    if (start.getTime() > Date.now() && entry.item_id) {
      try {
        await notifySlotFreed(payload, {
          resourceId: entry.resource_id,
          productId: entry.item_id,
          slotStart: start,
          slotEnd: entry.notified_slot_end ? new Date(entry.notified_slot_end) : new Date(start.getTime() + 60 * 60 * 1000),
        })
      } catch (err: unknown) {
        payload.logger.error({ err, message: 'waitlist auto-advance failed (unsubscribe)' })
      }
    }
  }

  return NextResponse.json({ status: 'cancelled' })
}
