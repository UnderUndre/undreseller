import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

/**
 * Staff authorization (spec 004 FR-402, research D4; 008 T813 rework):
 * TWO levels — L1 ShopSettings.staffChatIds → L2 env TELEGRAM_STAFF_CHAT_IDS.
 * The old "L3 the card's own chat" was a TAUTOLOGY (staffBot passed the same
 * chatId twice — antigravity F4 / F-BE-04); the card→chat binding is now a
 * REAL outbox lookup (sent_message_id + to_chat_id) done by staffBot.
 */
export async function isStaffChat(payload: Payload, chatId: string): Promise<boolean> {
  // L1: ShopSettings.staffChatIds (adminOnly field)
  try {
    const settings = (await payload.findGlobal({ slug: 'shop-settings', depth: 0 })) as {
      staffChatIds?: Array<{ chatId: string }>
    } | null
    const l1 = (settings?.staffChatIds ?? []).some((row) => String(row.chatId) === chatId)
    if (l1) return true
  } catch {
    // global missing — fall through
  }
  // L2: env list (csv)
  const envList = (process.env.TELEGRAM_STAFF_CHAT_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  if (envList.includes(chatId)) return true
  return false
}

/** Staff chat targets for the pager (L1 then L2 fallback). */
export async function staffChatTargets(payload: Payload): Promise<string[]> {
  try {
    const settings = (await payload.findGlobal({ slug: 'shop-settings', depth: 0 })) as {
      staffChatIds?: Array<{ chatId: string }>
    } | null
    const l1 = (settings?.staffChatIds ?? []).map((row) => String(row.chatId)).filter(Boolean)
    if (l1.length > 0) return l1
  } catch {
    // fall through to env
  }
  return (process.env.TELEGRAM_STAFF_CHAT_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean)
}

/**
 * Two-step confirm barrier (spec 004 US3, review F7): press 1 arms the barrier
 * (REQUIRES_CONFIRMATION, 0 mutations), press 2 within 30 s executes
 * (CONFIRMED). In-memory by design — CAS stays the correctness invariant
 * (analyze A4).
 */
const barriers = new Map<string, number>() // key → armed-until epoch ms
const BARRIER_WINDOW_MS = 30_000

export type BarrierVerdict = 'REQUIRES_CONFIRMATION' | 'CONFIRMED'

export function awaitConfirmBarrier(key: string, now = Date.now()): BarrierVerdict {
  const armedUntil = barriers.get(key)
  if (armedUntil && now <= armedUntil) {
    barriers.delete(key)
    return 'CONFIRMED'
  }
  barriers.set(key, now + BARRIER_WINDOW_MS)
  return 'REQUIRES_CONFIRMATION'
}

export function resetBarrier(key: string): void {
  barriers.delete(key)
}

/** Staff-card deep link to the customer reschedule page (003 canon). */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 6) return '••••••'
  return `${phone.slice(0, 2)}••• ••• •• ${digits.slice(-2)}`
}

export function cardTime(iso: string, timeZone: string, locale = 'ru-RU'): string {
  return new Date(iso).toLocaleString(locale, { timeZone, hour12: false })
}
