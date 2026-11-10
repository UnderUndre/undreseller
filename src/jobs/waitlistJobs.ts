import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import { matchFreedSlot } from '@/lib/waitlist/waitlistService'

/**
 * Waitlist matching job (spec 006 T620, research D3): enqueued by
 * `notifySlotFreed` from every RELEASED point; runs FIFO matching + emails.
 * Idempotency via the atomic campaign claim-mark (status guard per entry).
 */

export interface WaitlistMatchInput {
  resourceId: string
  productId: string
  slotStart: string
  slotEnd: string
  excludeEntryId?: number | null
}

export const waitlistMatchTask = {
  slug: 'waitlist-match',
  label: 'Waitlist: match freed slot to FIFO candidates (spec 006 FR-602)',
  retries: 3,
  handler: async ({ req, input }: { req: { payload: Payload }; input: unknown }) => {
    const data = input as WaitlistMatchInput
    const result = await matchFreedSlot(req.payload, {
      resourceId: data.resourceId,
      productId: data.productId,
      slotStart: data.slotStart,
      slotEnd: data.slotEnd,
      excludeEntryId: data.excludeEntryId ?? null,
    })
    return { output: result, state: 'succeeded' as const }
  },
}

export interface WaitlistSweepResult {
  expired: number
  reArmed: number
  advanced: number
}

/**
 * Lifecycle sweep (spec 006 US4, T630, review F7): every 5 minutes —
 * expired by horizon, stale campaigns re-armed or auto-advanced (only on a
 * still-free slot), campaign cap 3 enforced with a final email.
 */
export async function runWaitlistSweep(payload: Payload): Promise<WaitlistSweepResult> {
  const db: any = payload.db
  const out: WaitlistSweepResult = { expired: 0, reArmed: 0, advanced: 0 }
  const now = new Date()

  // 1) Horizon expiry (waiting + notified).
  const expired = await db.execute({
    drizzle: db.drizzle,
    sql: sql`UPDATE waitlist_entries SET status = 'expired', updated_at = now()
             WHERE status IN ('waiting', 'notified') AND expires_at < now()
             RETURNING id, customer_email, customer_name`,
  })
  for (const raw of (expired.rows ?? []) as Array<{ id: number; customer_email: string; customer_name: string }>) {
    await db.execute({
      drizzle: db.drizzle,
      sql: sql`INSERT INTO audit_events (action, actor_id, aggregate_type, aggregate_id, metadata_json, created_at, updated_at)
               VALUES ('waitlist.expired', 'SYSTEM', 'WAITLIST', ${String(raw.id)}, '{}'::jsonb, now(), now())`,
    })
    out.expired += 1
  }

  // 2) Stale campaigns (notified > 30 min).
  const stale = await db.execute({
    drizzle: db.drizzle,
    sql: sql`SELECT id, customer_email, customer_name, campaign_count, resource_id_id AS resource_id, service_id_id AS service_id,
                    notified_slot_start, notified_slot_end
             FROM waitlist_entries
             WHERE status = 'notified' AND active_campaign_at < now() - interval '30 minutes'`,
  })

  for (const raw of (stale.rows ?? []) as Array<{
    id: number
    customer_email: string
    customer_name: string
    campaign_count: number
    resource_id: number | string
    service_id: number | string
    notified_slot_start: string
    notified_slot_end: string
  }>) {
    const campaignCount = Number(raw.campaign_count)

    // Cap 3 → expired + final email (review F4/D4).
    if (campaignCount >= 3) {
      await db.execute({
        drizzle: db.drizzle,
        sql: sql`UPDATE waitlist_entries SET status = 'expired', updated_at = now() WHERE id = ${raw.id}`,
      })
      await db.execute({
        drizzle: db.drizzle,
        sql: sql`INSERT INTO audit_events (action, actor_id, aggregate_type, aggregate_id, metadata_json, created_at, updated_at)
                 VALUES ('waitlist.expired', 'SYSTEM', 'WAITLIST', ${String(raw.id)},
                         ${JSON.stringify({ reason: 'CAMPAIGN_CAP' })}::jsonb, now(), now())`,
      })
      const { sendWaitlistExpiredEmail } = await import('@/lib/waitlist/waitlistService')
      await sendWaitlistExpiredEmail(payload, {
        to: raw.customer_email,
        customerName: raw.customer_name,
        entryId: raw.id,
      })
      out.expired += 1
      continue
    }

    // Auto-advance only if the slot is still free and in the future (review F4).
    const slotStart = new Date(raw.notified_slot_start)
    let slotFree = slotStart.getTime() > Date.now()
    if (slotFree) {
      const clash = await db.execute({
        drizzle: db.drizzle,
        sql: sql`SELECT 1 FROM slot_reservations
                 WHERE resource_id = ${String(raw.resource_id)}
                   AND status IN ('HELD', 'BOOKED', 'PENDING_APPROVAL')
                   AND tstzrange(start_time, end_time) && tstzrange(${raw.notified_slot_start}::timestamptz, ${raw.notified_slot_end}::timestamptz)
                 LIMIT 1`,
      })
      slotFree = (clash.rows ?? []).length === 0
    }

    // Re-arm first (owning entry competes only in FUTURE campaigns).
    await db.execute({
      drizzle: db.drizzle,
      sql: sql`UPDATE waitlist_entries SET status = 'waiting', active_campaign_at = NULL,
               notified_slot_start = NULL, notified_slot_end = NULL, updated_at = now()
               WHERE id = ${raw.id} AND status = 'notified'`,
    })
    out.reArmed += 1

    if (slotFree) {
      const { notifySlotFreed } = await import('@/lib/waitlist/waitlistService')
      await notifySlotFreed(payload, {
        resourceId: String(raw.resource_id),
        productId: String(raw.service_id),
        slotStart: new Date(raw.notified_slot_start),
        slotEnd: new Date(raw.notified_slot_end),
        excludeEntryId: Number(raw.id), // advance PAST the entry that just had its chance
      })
      out.advanced += 1
    }
  }

  return out
}

export const waitlistSweepTask = {
  slug: 'waitlist-sweep',
  label: 'Waitlist lifecycle sweep — 5m (spec 006 FR-604, review F7)',
  schedule: [{ cron: '*/5 * * * *', queue: 'default' }],
  retries: 3,
  // Runtime contract verified in payload 3.93 dist: { inlineTask, input, job, req, tasks }.
  handler: async ({ req }: { req: { payload: Payload } }) => {
    const result = await runWaitlistSweep(req.payload)
    return { output: result, state: 'succeeded' as const }
  },
}
