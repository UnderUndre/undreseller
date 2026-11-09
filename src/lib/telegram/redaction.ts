import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import { enqueue } from '@/lib/telegram/outbox'

/**
 * GDPR card redaction (spec 004 FR-404, review F2): on a terminal booking
 * transition, every DELIVERED pager card (found via sentMessageId captured at
 * dispatch) is edited to `[ДАННЫЕ_КЛИЕНТА_УДАЛЕНЫ]` with CRITICAL priority.
 */
const REDACTED_TEXT = '[ДАННЫЕ_КЛИЕНТА_УДАЛЕНЫ]'

export interface RedactionResult {
  cardsQueued: number
}

export async function redactBookingCards(payload: Payload, reservationId: number): Promise<RedactionResult> {
  const db: any = payload.db
  const cards = await db.execute({
    drizzle: db.drizzle,
    sql: sql`SELECT id, to_chat_id, sent_message_id FROM telegram_outbox
             WHERE aggregate_type = 'BOOKING' AND aggregate_id = ${String(reservationId)}
               AND action_type = 'sendMessage' AND sent_message_id IS NOT NULL`,
  })
  let cardsQueued = 0
  for (const raw of (cards.rows ?? []) as Array<{ id: number; to_chat_id: string; sent_message_id: number }>) {
    await enqueue(payload, {
      bot: 'staff',
      actionType: 'editMessageText',
      toChatId: raw.to_chat_id,
      messageId: raw.sent_message_id,
      text: REDACTED_TEXT,
      replyMarkupJson: null,
      priority: 100,
      aggregateType: 'BOOKING',
      aggregateId: String(reservationId),
      metaJson: { redactionOf: raw.id },
    })
    cardsQueued += 1
  }
  return { cardsQueued }
}

/** Phone masking helper (shared canon, TC-004-006). */
export const maskPhoneCanon = (phone: string): string => {
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 6) return '••••••'
  return `${phone.slice(0, 2)}••• ••• •• ${digits.slice(-2)}`
}
