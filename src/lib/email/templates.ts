import { getServerSideURL } from '@/utilities/getURL'

/**
 * Booking email templates (spec 003 FR-305): confirmation carries the
 * scanner-safe cancel/reschedule links (GET pages — never consuming tokens);
 * the reminder carries the acknowledgement link.
 */

function baseUrl(): string {
  return getServerSideURL().replace(/\/$/, '')
}

export function confirmationEmail(params: {
  customerName: string
  bookingId: number
  startTime: string
  serviceName?: string
  cancelToken: string
  rescheduleToken: string
}): { subject: string; html: string } {
  const root = baseUrl()
  const cancelUrl = `${root}/booking/cancel?bookingId=${params.bookingId}&token=${params.cancelToken}`
  const rescheduleUrl = `${root}/booking/reschedule?bookingId=${params.bookingId}&token=${params.rescheduleToken}`
  return {
    subject: `Booking confirmed${params.serviceName ? ` — ${params.serviceName}` : ''}`,
    html: `<p>Hi ${escapeHtml(params.customerName)}, your appointment is confirmed.</p>
<p>When: ${escapeHtml(new Date(params.startTime).toLocaleString())}</p>
<p>Need to change plans? You can
<a href="${cancelUrl}">cancel</a> or
<a href="${rescheduleUrl}">reschedule</a> your booking.</p>`,
  }
}

export function reminderEmail(params: {
  customerName: string
  bookingId: number
  accessToken: string
  startTime: string
  serviceName?: string
}): { subject: string; html: string } {
  const root = baseUrl()
  const ackUrl = `${root}/booking/acknowledge?token=${params.accessToken}`
  return {
    subject: `Reminder${params.serviceName ? ` — ${params.serviceName}` : ''}`,
    html: `<p>Hi ${escapeHtml(params.customerName)}, this is a reminder of your appointment.</p>
<p>When: ${escapeHtml(new Date(params.startTime).toLocaleString())}</p>
<p><a href="${ackUrl}">Confirm you are coming</a></p>`,
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
