/**
 * RFC 5545 ICS writer (spec 005 T510, research D1/D3/D4): PURE — no IO, no
 * clocks (DTSTAMP comes from the booking row's updated_at), byte-deterministic
 * body. Handles the 004-canonical escape rules, CRLF line endings, RFC 5545
 * §3.1 line folding at ≤75 OCTETS (UTF-8 safe — never splits a code point),
 * PRODID/VERSION (review F5), the full status matrix including UNDERPAID →
 * TENTATIVE (re-check R1).
 */

const CRLF = '\r\n'
const MAX_OCTETS = 75

/** RFC 5545 §3.3.11 TEXT escaping (order matters: backslash first). */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

/**
 * RFC 5545 §3.1 line folding: content lines longer than 75 octets are split
 * with CRLF + single space. Folding counts OCTETS (not code points) and never
 * splits a multi-byte UTF-8 character (review F4).
 */
export function foldLine(line: string): string {
  const encoder = new TextEncoder()
  const bytes = encoder.encode(line)
  if (bytes.length <= MAX_OCTETS) return line

  const parts: string[] = []
  let start = 0 // code point index of the current part
  let octets = 0
  let firstSegment = true

  for (let i = 0; i < line.length; i++) {
    const code = line.codePointAt(i) as number
    const char = String.fromCodePoint(code)
    const charOctets = encoder.encode(char).length
    const budget = firstSegment ? MAX_OCTETS : MAX_OCTETS - 1 // continuation lines carry a leading space
    if (octets + charOctets > budget && i > start) {
      parts.push(line.slice(start, i))
      start = i
      octets = 0
      firstSegment = false
    }
    octets += charOctets
    if (code > 0xffff) i++ // surrogate pair = one code point
  }
  parts.push(line.slice(start))
  return parts.join(CRLF + ' ')
}

function icsTimestamp(date: Date): string {
  // UTC basic format: YYYYMMDDTHHMMSSZ
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

export type FeedStatus = 'CONFIRMED' | 'TENTATIVE' | 'CANCELLED'

/** Full DB-status → ICS STATUS mapping (spec rev 2.1, re-check R1: UNDERPAID → TENTATIVE). */
export function mapStatus(dbStatus: string): FeedStatus {
  switch (dbStatus) {
    case 'BOOKED':
      return 'CONFIRMED'
    case 'HELD':
    case 'PAYMENT_PENDING':
    case 'PENDING_APPROVAL':
    case 'UNDERPAID':
      return 'TENTATIVE'
    case 'RELEASED':
    case 'CANCELLED':
    case 'STAFF_REJECTED':
      return 'CANCELLED'
    default:
      // Unmapped → fail-closed: skip the event rather than invent a status.
      return 'CANCELLED'
  }
}

export interface FeedBooking {
  reservationId: number
  status: string
  startTime: Date | string
  endTime: Date | string
  updatedAt: Date | string
  serviceName?: string | null
  customerName?: string | null
}

export interface BuildFeedInput {
  resourceName: string
  host: string
  bookings: FeedBooking[]
  /** Freeze-able clock (tests, R4); production injects new Date(). */
  now?: Date
}

const SEQUENCE_BY_STATUS: Record<FeedStatus, number> = {
  CONFIRMED: 0,
  TENTATIVE: 0,
  CANCELLED: 1,
}

/** Pure ICS builder — byte-deterministic for identical inputs (research D3). */
export function buildFeed(input: BuildFeedInput): string {
  const now = input.now ?? new Date()
  const windowStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const windowEnd = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000)

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//UnderUndre//undreseller//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(input.resourceName || 'Запись')}`,
    'REFRESH-INTERVAL;VALUE=DURATION:PT15M',
    'X-PUBLISHED-TTL:PT15M',
  ]

  const inWindow = input.bookings.filter((b) => {
    const start = new Date(b.startTime).getTime()
    return start >= windowStart.getTime() && start <= windowEnd.getTime()
  })

  for (const b of inWindow) {
    const status = mapStatus(b.status)
    const serviceName = b.serviceName?.trim() || 'Запись'
    const customerName = b.customerName?.trim() || 'Клиент'
    const summary = `${serviceName} — ${customerName}`
    lines.push('BEGIN:VEVENT')
    lines.push(`UID:booking-${b.reservationId}@${input.host}`)
    lines.push(`DTSTAMP:${icsTimestamp(new Date(b.updatedAt))}`)
    lines.push(`DTSTART:${icsTimestamp(new Date(b.startTime))}`)
    lines.push(`DTEND:${icsTimestamp(new Date(b.endTime))}`)
    lines.push(`SUMMARY:${escapeText(summary)}`)
    lines.push(`STATUS:${status}`)
    lines.push(`SEQUENCE:${SEQUENCE_BY_STATUS[status]}`)
    lines.push('TRANSP:OPAQUE')
    lines.push('END:VEVENT')
  }

  lines.push('END:VCALENDAR')
  // RFC 5545: CRLF endings, folding applied per content line.
  return lines.map(foldLine).join(CRLF) + CRLF
}
