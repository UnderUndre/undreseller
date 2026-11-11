import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import { acknowledgeBooking, cancelBookingByClientChat } from '@/lib/booking/bookingService'
import { enqueue } from '@/lib/telegram/outbox'
import { isBlacklisted } from '@/lib/telegram/blacklist'

/**
 * Client confirmation bot (spec 004 US4, FR-403/407): deep-link linking,
 * confirm/decline callbacks with cooldown, blacklist enforcement.
 */

const COOLDOWN_MS = 24 * 60 * 60 * 1000
const cooldowns = new Map<string, number>() // `chatId:action` → until epoch ms

export function cooldownVerdict(chatId: string, action: string, now = Date.now()): 'allowed' | 'cooldown' {
  const key = `${chatId}:${action}`
  const until = cooldowns.get(key)
  if (until && now < until) return 'cooldown'
  cooldowns.set(key, now + COOLDOWN_MS)
  return 'allowed'
}

export function parseClientCallback(data: string): { action: 'ack' | 'dec'; orderId: number } | null {
  const m = /^c:(ack|dec):(\d+)$/.exec(data)
  if (!m) return null
  return { action: m[1] as 'ack' | 'dec', orderId: Number(m[2]) }
}

/** Idempotent /start linking (FR-407): composite UNIQUE (chat_id, order_id). */
export async function linkChat(payload: Payload, chatId: string, accessToken: string): Promise<{ linked: boolean; orderId?: number }> {
  const db: any = payload.db
  const order = await db.execute({
    drizzle: db.drizzle,
    sql: sql`SELECT id FROM orders WHERE access_token = ${accessToken} LIMIT 1`,
  })
  const row = order.rows?.[0] as { id: number } | undefined
  if (!row) return { linked: false }
  await db.execute({
    drizzle: db.drizzle,
    sql: sql`INSERT INTO tg_links (chat_id, order_id, created_at, updated_at)
             VALUES (${chatId}, ${row.id}, now(), now())
             ON CONFLICT DO NOTHING`,
  })
  return { linked: true, orderId: row.id }
}

export type ClientActionResult =
  | { status: 'acknowledged' | 'cancelled' | 'ALREADY_PROCESSED' | 'REQUIRES_CONFIRMATION' | 'cooldown' | 'blacklisted' | 'LINK_NOT_FOUND'; scheduleVersion?: number; refund?: string }

/** Handle a client callback (webhook route → here). 0 mutations for blacklist/auth failures. */
export async function handleClientCallback(
  payload: Payload,
  args: { chatId: string; data: string; now?: Date },
  gateway?: Parameters<typeof cancelBookingByClientChat>[2],
): Promise<ClientActionResult> {
  const cb = parseClientCallback(args.data)
  if (!cb) return { status: 'ALREADY_PROCESSED' }

  // Blacklist enforcement (FR-406): 403-equivalent, 0 mutations.
  if (await isBlacklisted(payload, { chatId: args.chatId })) {
    await enqueue(payload, {
      bot: 'client',
      actionType: 'editMessageReplyMarkup',
      toChatId: args.chatId,
      messageId: undefined,
      replyMarkupJson: null,
      priority: 10,
      aggregateType: 'BOOKING',
      aggregateId: String(cb.orderId),
    })
    return { status: 'blacklisted' }
  }

  if (cooldownVerdict(args.chatId, cb.action, args.now?.getTime()) === 'cooldown') {
    return { status: 'cooldown' }
  }

  if (cb.action === 'ack') {
    const res = await acknowledgeByOrder(payload, { chatId: args.chatId, orderId: cb.orderId })
    if (!res) return { status: 'LINK_NOT_FOUND' }
    return { status: res.status, scheduleVersion: res.scheduleVersion }
  }

  // decline → domain seam with the 003 refund policy (review F3).
  try {
    const res = await cancelBookingByClientChat(
      payload,
      { orderId: cb.orderId, chatId: args.chatId, now: args.now },
      gateway,
    )
    // Staff alert (outbox HIGH).
    await enqueue(payload, {
      bot: 'staff',
      actionType: 'sendMessage',
      toChatId: process.env.TELEGRAM_STAFF_CHAT_IDS?.split(',')[0]?.trim() ?? '',
      text: `⚠️ Booking #${res.reservationId} cancelled via Telegram (refund: ${res.refund ?? 'n/a'})`,
      priority: 50,
      aggregateType: 'BOOKING',
      aggregateId: String(res.reservationId),
    })
    return { status: 'cancelled', scheduleVersion: res.scheduleVersion, refund: res.refund }
  } catch (err) {
    const code = (err as { code?: string }).code
    if (code === 'BOOKING_NOT_ACTIVE') return { status: 'ALREADY_PROCESSED' }
    if (code === 'LINK_NOT_FOUND') return { status: 'LINK_NOT_FOUND' }
    throw err
  }
}

/**
 * acknowledgeBooking resolves by accessToken; the bot only knows orderId.
 * 008 T813 (SEC-A-07): the callback chat MUST be linked to the order
 * (tg_links) — same gate as cancelBookingByClientChat; without it a foreign
 * chat could confirm someone else's booking once c:ack cards ship.
 */
async function acknowledgeByOrder(payload: Payload, args: { chatId: string; orderId: number }) {
  const db: any = payload.db
  const link = await db.execute({
    drizzle: db.drizzle,
    sql: sql`SELECT 1 FROM tg_links WHERE chat_id = ${args.chatId} AND order_id = ${args.orderId} LIMIT 1`,
  })
  if ((link.rows ?? []).length === 0) return null
  const row = await db.execute({
    drizzle: db.drizzle,
    sql: sql`SELECT o.access_token FROM orders o
             JOIN slot_reservations sr ON sr.order_id = o.id
             WHERE o.id = ${args.orderId} AND sr.status IN ('BOOKED','HELD','PENDING_APPROVAL','PAYMENT_PENDING')
             ORDER BY sr.id DESC LIMIT 1`,
  })
  const accessToken = (row.rows?.[0] as { access_token?: string } | undefined)?.access_token
  if (!accessToken) return null
  return acknowledgeBooking(payload, accessToken)
}
