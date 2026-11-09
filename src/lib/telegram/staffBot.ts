import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import { approveBooking } from '@/lib/booking/bookingService'
import { enqueue } from '@/lib/telegram/outbox'
import { awaitConfirmBarrier, isStaffChat } from '@/lib/telegram/staffAuth'
import { formatStaffCard, staffCardButtons, type CardAction } from '@/lib/telegram/staffCard'

/**
 * Staff pager (spec 004 US3, FR-402 / review F2 D9): card formatting + the
 * five CAS actions. ALL mutations go through the domain service (CAS
 * scheduleVersion); destructive actions sit behind the two-press barrier.
 */

/** Enqueue pager cards for all staff chats (D9) — booking flow never blocks. */
export async function enqueueStaffCard(
  payload: Payload,
  booking: Parameters<typeof formatStaffCard>[0],
  staffChatIds: string[],
): Promise<void> {
  for (const chatId of staffChatIds) {
    await enqueue(payload, {
      bot: 'staff',
      actionType: 'sendMessage',
      toChatId: chatId,
      text: formatStaffCard(booking),
      replyMarkupJson: staffCardButtons(booking.reservationId, booking.scheduleVersion),
      priority: 50,
      aggregateType: 'BOOKING',
      aggregateId: String(booking.reservationId),
    })
  }
}

export type StaffActionResult =
  | { status: 'approved' | 'rejected' | 'ALREADY_PROCESSED' | 'REQUIRES_CONFIRMATION' | 'completed' | 'invalid-state' | 'auth-denied' | 'blacklisted'; scheduleVersion?: number }

interface StaffCallback {
  action: CardAction
  reservationId: string
  scheduleVersion: string
}

export function parseStaffCallback(data: string): StaffCallback | null {
  const m = /^s:(approve|reject|reschedule|complete|blacklist):(\d+):(\d+)$/.exec(data)
  if (!m) return null
  return { action: m[1] as CardAction, reservationId: m[2], scheduleVersion: m[3] }
}

/** Handle a staff callback (webhook route → here). Always answers; 0 silent mutations. */
export async function handleStaffCallback(
  payload: Payload,
  args: { chatId: string; data: string },
): Promise<StaffActionResult> {
  const cb = parseStaffCallback(args.data)
  if (!cb) return { status: 'invalid-state' }

  // 3-level auth (L3: callback must come from the card's own chat).
  if (!(await isStaffChat(payload, args.chatId, args.chatId))) {
    await enqueue(payload, {
      bot: 'staff',
      actionType: 'sendMessage',
      toChatId: args.chatId,
      text: '⛔ Not authorized for staff actions',
      priority: 50,
      aggregateType: 'BOOKING',
      aggregateId: cb.reservationId,
    })
    return { status: 'auth-denied' }
  }

  // Destructive actions: two-press barrier (review F7).
  if (cb.action === 'reject' || cb.action === 'blacklist') {
    const verdict = awaitConfirmBarrier(`s:${cb.action}:${cb.reservationId}`)
    if (verdict === 'REQUIRES_CONFIRMATION') {
      return { status: 'REQUIRES_CONFIRMATION' }
    }
  }

  if (cb.action === 'approve' || cb.action === 'reject') {
    const res = await approveBooking(payload, {
      reservationId: cb.reservationId,
      action: cb.action,
      actorId: `tg:${args.chatId}`,
    })
    return { status: res.status === 'rejected' ? 'rejected' : res.status, scheduleVersion: res.scheduleVersion }
  }

  if (cb.action === 'complete') {
    // Order-level (audit C1 / review F11): only processing orders with an active booking.
    const db: any = payload.db
    const rows = await db.execute({
      drizzle: db.drizzle,
      sql: sql`SELECT o.status AS order_status, sr.status AS res_status
               FROM slot_reservations sr JOIN orders o ON o.id = sr.order_id
               WHERE sr.id = ${cb.reservationId} LIMIT 1`,
    })
    const row = rows.rows?.[0] as { order_status: string; res_status: string } | undefined
    if (!row) return { status: 'invalid-state' }
    if (row.order_status !== 'processing' || row.res_status !== 'BOOKED') {
      return { status: 'invalid-state' }
    }
    const cas = await db.execute({
      drizzle: db.drizzle,
      sql: sql`UPDATE orders SET status = 'completed', updated_at = now()
               WHERE status = 'processing'
                 AND id = (SELECT order_id FROM slot_reservations WHERE id = ${cb.reservationId})
               RETURNING id`,
    })
    if ((cas.rows ?? []).length === 0) return { status: 'ALREADY_PROCESSED' }
    await db.execute({
      drizzle: db.drizzle,
      sql: sql`INSERT INTO audit_events (action, actor_id, aggregate_type, aggregate_id, metadata_json, created_at, updated_at)
               VALUES ('booking.complete', ${'tg:' + args.chatId}, 'ORDER',
                       (SELECT order_id FROM slot_reservations WHERE id = ${cb.reservationId})::text, '{}'::jsonb, now(), now())`,
    })
    return { status: 'completed' }
  }

  if (cb.action === 'reschedule') {
    // Full flow lands via issueRescheduleToken (T431) — wired in staffReschedule.ts.
    return { status: 'invalid-state' }
  }

  if (cb.action === 'blacklist') {
    const db: any = payload.db
    const rows = await db.execute({
      drizzle: db.drizzle,
      sql: sql`SELECT customer_phone FROM slot_reservations WHERE id = ${cb.reservationId} LIMIT 1`,
    })
    const phone = (rows.rows?.[0] as { customer_phone?: string } | undefined)?.customer_phone
    try {
      await payload.create({
        collection: 'blacklist',
        data: { phone: phone ?? undefined, reason: 'staff blacklisted via card', createdBy: `tg:${args.chatId}` },
        overrideAccess: true,
      })
      return { status: 'blacklisted' }
    } catch {
      return { status: 'ALREADY_PROCESSED' }
    }
  }

  return { status: 'invalid-state' }
}
