import { computeAvailableSlots, computeSlotsWithReasons } from '@/lib/booking/windows';

jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    availabilityException: { findUnique: jest.fn().mockResolvedValue(null) },
    weeklyHours: { findFirst: jest.fn() },
    slotReservation: { findMany: jest.fn().mockResolvedValue([]) },
  },
}));

import { prisma } from '@/lib/db/prisma';

const mockedWeeklyHours = prisma.weeklyHours.findFirst as jest.Mock;
const mockedReservations = prisma.slotReservation.findMany as jest.Mock;

/** Working hours 09:00–18:00, no break, mocked per test. */
function mockHours(startMin = 9 * 60, endMin = 18 * 60) {
  mockedWeeklyHours.mockResolvedValue({
    startMin,
    endMin,
    breakStartMin: null,
    breakEndMin: null,
  });
}

describe('IANA/DST-Correct Availability Windows (T030, FR-407)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedReservations.mockResolvedValue([]);
  });

  it('America/New_York: 09:00 local is 14:00Z in winter (EST) and 13:00Z in summer (EDT)', async () => {
    mockHours();

    // 2026-03-07 is EST (UTC-5): 09:00 EST = 14:00Z
    const winter = await computeAvailableSlots({
      dateStr: '2026-03-07',
      durationMin: 60,
      fulfillmentMode: 'IN_CALL',
      minNoticeMin: 0,
      timeZone: 'America/New_York',
      now: new Date('2026-03-01T00:00:00Z'),
    });
    expect(winter.some((s) => s.startsAt === '2026-03-07T14:00:00.000Z')).toBe(true);
    expect(winter.some((s) => s.startsAt === '2026-03-07T13:00:00.000Z')).toBe(false);

    // 2026-03-09 is EDT (UTC-4, after the 2026-03-08 spring-forward): 09:00 EDT = 13:00Z
    const summer = await computeAvailableSlots({
      dateStr: '2026-03-09',
      durationMin: 60,
      fulfillmentMode: 'IN_CALL',
      minNoticeMin: 0,
      timeZone: 'America/New_York',
      now: new Date('2026-03-01T00:00:00Z'),
    });
    expect(summer.some((s) => s.startsAt === '2026-03-09T13:00:00.000Z')).toBe(true);
    // 12:00Z would be 08:00 EDT — before working hours; (14:00Z = 10:00 EDT, valid)
    expect(summer.some((s) => s.startsAt === '2026-03-09T12:00:00.000Z')).toBe(false);
  });

  it('Europe/Berlin fall-back: 2026-10-25 repeats 03:00; late-morning slots stay on CET offset (+1)', async () => {
    mockHours(10 * 60, 18 * 60);

    const slots = await computeAvailableSlots({
      dateStr: '2026-10-25',
      durationMin: 60,
      fulfillmentMode: 'IN_CALL',
      minNoticeMin: 0,
      timeZone: 'Europe/Berlin',
      now: new Date('2026-10-01T00:00:00Z'),
    });
    // 10:00 local on 2026-10-25 (after fall-back, CEST->CET) = 09:00Z
    expect(slots.some((s) => s.startsAt === '2026-10-25T09:00:00.000Z')).toBe(true);
    // 17:00 local = 16:00Z (CET, UTC+1)
    expect(slots.some((s) => s.startsAt === '2026-10-25T16:00:00.000Z')).toBe(true);
  });

  it('UTC default is preserved for existing callers (backward compatibility)', async () => {
    mockHours();
    const slots = await computeAvailableSlots({
      dateStr: '2026-10-21',
      durationMin: 60,
      fulfillmentMode: 'IN_CALL',
      minNoticeMin: 0,
      now: new Date('2026-10-20T00:00:00Z'),
    });
    expect(slots.some((s) => s.startsAt === '2026-10-21T09:00:00.000Z')).toBe(true);
  });

  it('weekday resolution uses the business-local calendar date (Mon 2026-10-19)', async () => {
    mockHours();
    await computeAvailableSlots({
      dateStr: '2026-10-19', // Monday
      durationMin: 60,
      fulfillmentMode: 'IN_CALL',
      minNoticeMin: 0,
      timeZone: 'Asia/Yerevan',
      now: new Date('2026-10-01T00:00:00Z'),
    });
    expect(mockedWeeklyHours).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ weekday: 1 }) })
    );
  });
});

describe('Unavailable Reasons (T031, FR-408)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedReservations.mockResolvedValue([]);
  });

  it('reports blocked candidates as booked|break while available slots stay clean', async () => {
    mockHours(10 * 60, 18 * 60);
    // Lunch 13:00-14:00
    mockedWeeklyHours.mockResolvedValue({
      startMin: 10 * 60,
      endMin: 18 * 60,
      breakStartMin: 13 * 60,
      breakEndMin: 14 * 60,
    });
    // Existing booking 11:30-12:30
    mockedReservations.mockResolvedValue([
      {
        startTime: new Date('2026-10-21T11:30:00.000Z'),
        endTime: new Date('2026-10-21T12:30:00.000Z'),
      },
    ]);

    const { slots, unavailable } = await computeSlotsWithReasons({
      dateStr: '2026-10-21',
      durationMin: 75,
      fulfillmentMode: 'IN_CALL',
      minNoticeMin: 0,
      now: new Date('2026-10-20T00:00:00Z'),
    });

    const startTimes = slots.map((s) => s.startsAt);
    expect(startTimes).toContain('2026-10-21T10:00:00.000Z');
    expect(startTimes).not.toContain('2026-10-21T10:30:00.000Z'); // overlaps booking
    expect(startTimes).not.toContain('2026-10-21T12:30:00.000Z'); // overlaps break

    const byStart = new Map(unavailable.map((u) => [u.startsAt, u.reason]));
    expect(byStart.get('2026-10-21T10:30:00.000Z')).toBe('booked');
    expect(byStart.get('2026-10-21T11:00:00.000Z')).toBe('booked');
    expect(byStart.get('2026-10-21T12:30:00.000Z')).toBe('break');
    expect(byStart.get('2026-10-21T10:00:00.000Z')).toBeUndefined();

    // No overlap between the two sets
    const availableSet = new Set(startTimes);
    for (const u of unavailable) {
      expect(availableSet.has(u.startsAt)).toBe(false);
    }
  });
});
