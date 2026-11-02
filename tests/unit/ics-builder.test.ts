/**
 * T030: ICS builder tests (FR-605): escape BVA, TZID (Asia/Yerevan, UTC),
 * UID stability, CRLF folding ≤75 octets, PUBLISH/CANCEL method switching.
 */
import {
  buildIcs,
  escapeIcsText,
  foldIcsLine,
  bookingIcsUid,
  parseIcsStructure,
  IcsEventInput,
} from '@/lib/integrations/ics';

const base: IcsEventInput = {
  orderId: 'order-123',
  orderNumber: 'ORD-123',
  serviceTitle: 'Консультация',
  description: 'Клиент: И***\nТелефон: ***0000',
  startsAt: new Date('2027-02-01T10:00:00Z'),
  endsAt: new Date('2027-02-01T11:00:00Z'),
  timeZone: 'Asia/Yerevan',
  method: 'PUBLISH',
};

describe('T030: escape rules (BVA: , ; : \\ \\n)', () => {
  it('escapes comma, semicolon, backslash and newlines', () => {
    expect(escapeIcsText('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne');
  });

  it('colon is NOT escaped (RFC 5545 TEXT allows it)', () => {
    expect(escapeIcsText('10:00')).toBe('10:00');
  });

  it('SUMMARY carries escaped service title', () => {
    const ics = buildIcs({ ...base, serviceTitle: 'Массаж, спа; Day' });
    expect(ics).toContain('SUMMARY:Массаж\\, спа\\; Day — ORD-123');
  });
});

describe('T030: TZID handling', () => {
  it('DTSTART;TZID uses ShopSettings.timeZone (Asia/Yerevan, UTC+4)', () => {
    const parsed = parseIcsStructure(buildIcs(base));
    expect(parsed.tzid).toBe('Asia/Yerevan');
    expect(parsed.dtstart).toBe('20270201T140000');
  });

  it('UTC tz renders Z-less local-form UTC wall clock', () => {
    const parsed = parseIcsStructure(buildIcs({ ...base, timeZone: 'UTC' }));
    expect(parsed.tzid).toBe('UTC');
    expect(parsed.dtstart).toBe('20270201T100000');
  });
});

describe('T030: UID stability + method switching', () => {
  it('re-sending yields the same UID', () => {
    const a = parseIcsStructure(buildIcs(base)).uid;
    const b = parseIcsStructure(buildIcs({ ...base, method: 'CANCEL' })).uid;
    expect(a).toBe(b);
    expect(a).toBe('booking-order-123@undreseller');
  });

  it('PUBLISH → CONFIRMED; CANCEL → STATUS:CANCELLED, METHOD:CANCEL', () => {
    const publish = parseIcsStructure(buildIcs(base));
    expect(publish.method).toBe('PUBLISH');
    expect(publish.status).toBe('CONFIRMED');

    const cancel = parseIcsStructure(buildIcs({ ...base, method: 'CANCEL' }));
    expect(cancel.method).toBe('CANCEL');
    expect(cancel.status).toBe('CANCELLED');
  });
});

describe('T030: structure and line folding', () => {
  it('parses as a valid VCALENDAR/VEVENT with CRLF line endings', () => {
    const parsed = parseIcsStructure(buildIcs(base));
    expect(parsed.hasCalendar).toBe(true);
    expect(parsed.hasEvent).toBe(true);
    expect(parsed.lineEndingsCrlf).toBe(true);
  });

  it('folds lines longer than 75 octets with CRLF + space (continuation un-folds to original)', () => {
    const longTitle = 'Х'.repeat(120);
    const ics = buildIcs({ ...base, serviceTitle: longTitle });
    for (const line of ics.split('\r\n')) {
      const bytes = Buffer.byteLength(line, 'utf8');
      expect(bytes).toBeLessThanOrEqual(75);
    }
    // unfolding restores the full summary
    const unfolded = ics.replace(/\r\n /g, '');
    expect(unfolded).toContain(`SUMMARY:${escapeIcsText(longTitle)} — ORD-123`);
  });

  it('foldIcsLine: exactly-75-octet line is not folded', () => {
    const line = 'S' + 'x'.repeat(74);
    expect(foldIcsLine(line)).toBe(line);
  });
});
