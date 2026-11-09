import { cardTime, maskPhone } from '@/lib/telegram/staffAuth'

/**
 * Pure staff-card formatting (spec 004 US3): no service imports — safe for
 * bookingService to enqueue pager cards without an import cycle (staffBot
 * re-exports for the callback surface).
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
}): string {
  const notes = booking.hasNotes ? '📝 notes: yes' : ''
  return [
    `🆕 Booking #${booking.reservationId} (${booking.fulfillment ?? 'IN_CALL'})`,
    `👤 ${booking.customerName} · ${maskPhone(booking.customerPhone)} ${notes}`,
    `🛎 ${booking.serviceName ?? 'service'} · ${booking.durationMin} min`,
    `🗓 ${cardTime(booking.startTime, booking.timeZone)}`,
  ].join('\n')
}
