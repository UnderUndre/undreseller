import { cardTime, maskPhone } from '@/lib/telegram/staffAuth'

/**
 * Pure staff-card formatting (spec 004 US3): no service imports — safe for
 * bookingService to enqueue pager cards without an import cycle (staffBot
 * re-exports for the callback surface).
 * 014 FR-1405 (fix AG-F7.2): itemized card — primary line + up to 3 basket
 * lines + `+N ещё`; the header duration is the CONTAINER duration (Σ).
 */

const CARD_ACTIONS = ['approve', 'reject', 'reschedule', 'complete', 'blacklist'] as const
export type CardAction = (typeof CARD_ACTIONS)[number]

export function staffCardButtons(reservationId: number, scheduleVersion: number): Record<string, unknown> {
  const cb = (a: CardAction) => ({
    text: { approve: '✅ Approve', reject: '❌ Reject', reschedule: '🔁 Reschedule', complete: '🏁 Complete', blacklist: '⛔ Blacklist' }[a],
    callback_data: `s:${a}:${reservationId}:${scheduleVersion}`,
  })
  return { inline_keyboard: [CARD_ACTIONS.map(cb)] }
}

export function formatStaffCard(booking: {
  reservationId: number
  scheduleVersion: number
  customerName: string
  customerPhone: string
  hasNotes?: boolean
  serviceName?: string | null
  durationMin: number
  startTime: string
  timeZone: string
  fulfillment?: string
  /** Composite snapshot (spec 014) — primary-first; absent for legacy rows. */
  items?: Array<{ title: string; durationMin: number; addOn?: boolean }>
}): string {
  const notes = booking.hasNotes ? '📝 notes: yes' : ''
  const lines = [
    `🆕 Booking #${booking.reservationId} (${booking.fulfillment ?? 'IN_CALL'})`,
    `👤 ${booking.customerName} · ${maskPhone(booking.customerPhone)} ${notes}`,
    `🛎 ${booking.serviceName ?? 'service'} · ${booking.durationMin} min`,
  ]
  // Itemized basket: primary is the header line; the rest ride as sub-lines
  // (≤3 shown, then a counter — pure text, outbox canon unchanged).
  const extra = (booking.items ?? []).slice(1)
  for (const it of extra.slice(0, 3)) {
    lines.push(`   ➕ ${it.title}${it.durationMin > 0 ? ` · ${it.durationMin} min` : ' (included)'}`)
  }
  if (extra.length > 3) {
    lines.push(`   … +${extra.length - 3} more`)
  }
  lines.push(`🗓 ${cardTime(booking.startTime, booking.timeZone)}`)
  return lines.join('\n')
}
