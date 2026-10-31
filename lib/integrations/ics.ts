/**
 * ICS builder (T030, FR-605): RFC 5545 attachment for booking confirmation
 * (METHOD:PUBLISH) and cancellation (METHOD:CANCEL, same UID).
 *
 * TZID comes from ShopSettings.timeZone (canon — F5-rev), stable UID
 * `booking-<orderId>@<instance>`, CRLF line endings, line folding ≤75 octets,
 * escape rules for , ; \ and newlines.
 */

import { toZonedTime, fromZonedTime } from 'date-fns-tz';

export type IcsMethod = 'PUBLISH' | 'CANCEL';

export interface IcsEventInput {
  orderId: string;
  orderNumber: string;
  serviceTitle: string;
  description?: string;
  startsAt: Date;
  endsAt: Date;
  /** IANA timezone (ShopSettings.timeZone canon, F5-rev). */
  timeZone: string;
  method: IcsMethod;
  /** Instance identifier for the UID suffix (hostname / instance slug). */
  instanceId?: string;
}

/** RFC 5545 §3.3.11 TEXT escaping. */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n/g, '\\n')
    .replace(/\n/g, '\\n');
}

/** RFC 5545 §3.1: fold lines longer than 75 octets with CRLF + single space. */
export function foldIcsLine(line: string): string {
  const encoder = new TextEncoder();
  const folded: string[] = [];
  let current = '';
  let currentBytes = 0;
  for (const ch of line) {
    const chBytes = encoder.encode(ch).length;
    if (currentBytes + chBytes > 75) {
      folded.push(current);
      current = ` ${ch}`;
      currentBytes = 1 + chBytes;
    } else {
      current += ch;
      currentBytes += chBytes;
    }
  }
  folded.push(current);
  return folded.join('\r\n');
}

/** Local wall-clock in the target tz formatted for `DTSTART;TZID=…`. */
function formatLocalTz(date: Date, timeZone: string): string {
  const zoned = toZonedTime(date, timeZone);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${zoned.getFullYear()}${pad(zoned.getMonth() + 1)}${pad(zoned.getDate())}` +
    `T${pad(zoned.getHours())}${pad(zoned.getMinutes())}${pad(zoned.getSeconds())}`
  );
}

/** Stable UID: re-sending the same booking yields the same UID (FR-605). */
export function bookingIcsUid(orderId: string, instanceId?: string): string {
  return `booking-${orderId}@${instanceId ?? process.env.INSTANCE_ID ?? 'undreseller'}`;
}

export function buildIcs(input: IcsEventInput): string {
  const uid = bookingIcsUid(input.orderId, input.instanceId);
  const stamp = formatLocalTz(new Date(), input.timeZone);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Undreseller//Booking//EN',
    `METHOD:${input.method}`,
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART;TZID=${input.timeZone}:${formatLocalTz(input.startsAt, input.timeZone)}`,
    `DTEND;TZID=${input.timeZone}:${formatLocalTz(input.endsAt, input.timeZone)}`,
    `SUMMARY:${escapeIcsText(`${input.serviceTitle} — ${input.orderNumber}`)}`,
    input.description ? `DESCRIPTION:${escapeIcsText(input.description)}` : null,
    input.method === 'CANCEL' ? 'STATUS:CANCELLED' : 'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter((l): l is string => l !== null);

  return lines.map(foldIcsLine).join('\r\n') + '\r\n';
}

/** Structural validation (tests): required VCALENDAR/VEVENT pairs, TZID present. */
export function parseIcsStructure(ics: string): {
  hasCalendar: boolean;
  hasEvent: boolean;
  uid?: string;
  method?: string;
  tzid?: string;
  dtstart?: string;
  status?: string;
  lineEndingsCrlf: boolean;
} {
  const hasCalendar = /BEGIN:VCALENDAR[\s\S]*END:VCALENDAR/.test(ics);
  const hasEvent = /BEGIN:VEVENT[\s\S]*END:VEVENT/.test(ics);
  const uid = ics.match(/^UID:(.+)$/m)?.[1];
  const method = ics.match(/^METHOD:(.+)$/m)?.[1];
  const tzid = ics.match(/^DTSTART;TZID=([^:]+):/m)?.[1];
  const dtstart = ics.match(/^DTSTART;TZID=[^:]+:(.+)$/m)?.[1];
  const status = ics.match(/^STATUS:(.+)$/m)?.[1];
  const lineEndingsCrlf = !/(?<!\r)\n/.test(ics);
  return { hasCalendar, hasEvent, uid, method, tzid, dtstart, status, lineEndingsCrlf };
}

// re-exported for tests that verify tz conversions round-trip
export { fromZonedTime };
