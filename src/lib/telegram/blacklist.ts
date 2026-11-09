import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

/**
 * Blacklist enforcement (spec 004 FR-406): fail-closed checks against BOTH
 * identifiers — Telegram chatId and booking phone (review F9).
 */
export async function isBlacklisted(
  payload: Payload,
  identifiers: { chatId?: string; phone?: string },
): Promise<boolean> {
  const db: any = payload.db
  if (identifiers.chatId) {
    const byChat = await db.execute({
      drizzle: db.drizzle,
      sql: sql`SELECT 1 FROM blacklist WHERE chat_id = ${identifiers.chatId} LIMIT 1`,
    })
    if ((byChat.rows ?? []).length > 0) return true
  }
  if (identifiers.phone) {
    const byPhone = await db.execute({
      drizzle: db.drizzle,
      sql: sql`SELECT 1 FROM blacklist WHERE phone = ${identifiers.phone} LIMIT 1`,
    })
    if ((byPhone.rows ?? []).length > 0) return true
  }
  return false
}
