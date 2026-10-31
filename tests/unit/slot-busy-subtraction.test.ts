/**
 * T023 (FR-603): ExternalBusyBlock subtracts from available slots per
 * resource (isolation: master A's calendar never blocks master B).
 */
import { computeSlotsWithReasons } from '@/lib/booking/windows';

jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    availabilityException: { findUnique: jest.fn().mockResolvedValue(null) },
    weeklyHours: { findFirst: jest.fn().mockResolvedValue(null) },
    slotReservation: { findMany: jest.fn().mockResolvedValue([]) },
    externalBusyBlock: { findMany: jest.fn().mockResolvedValue([]) },
  },
}));

import { prisma } from '@/lib/db/prisma';

const mockedWeeklyHours = prisma.weeklyHours.findFirst as jest.Mock;
const mockedReservations = prisma.slotReservation.findMany as jest.Mock;
const mockedBusy = prisma.externalBusyBlock.findMany as jest.Mock;

function mockHours(startMin = 9 * 60, endMin = 18 * 60) {
  mockedWeeklyHours.mockResolvedValue({
    resourceId: 'res-1',
    weekday: 1,
    startMin,
    endMin,
    breakStartMin: null,
    breakEndMin: null,
  });
}

const params = {
  dateStr: '2027-02-01',
  durationMin: 60,
  fulfillmentMode: 'IN_CALL' as const,
  resourceId: 'res-1',
  timeZone: 'UTC',
};

describe('T023: ExternalBusyBlock slot subtraction (per-resource)', () => {
  beforeEach(() => {
    mockHours();
    mockedReservations.mockResolvedValue([]);
    mockedBusy.mockResolvedValue([]);
  });

  it('third-party GC busy interval blocks overlapping slots', async () => {
    mockedBusy.mockResolvedValue([
      { startUtc: new Date('2027-02-01T10:00:00Z'), endUtc: new Date('2027-02-01T11:00:00Z') },
    ]);
    const res = await computeSlotsWithReasons(params);
    expect(res.slots.some((s) => s.startsAt === '2027-02-01T10:00:00.000Z')).toBe(false);
    expect(res.slots.some((s) => s.startsAt === '2027-02-01T09:00:00.000Z')).toBe(true);
    expect(res.slots.some((s) => s.startsAt === '2027-02-01T11:00:00.000Z')).toBe(true);
  });

  it('busy blocks of another resource are NOT queried/subtracted (isolation A/B)', async () => {
    await computeSlotsWithReasons(params);
    expect(mockedBusy).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ resourceId: 'res-1' }) })
    );
  });

  it('no busy blocks → slots identical to reservation-only computation', async () => {
    const res = await computeSlotsWithReasons(params);
    expect(res.slots.length).toBeGreaterThan(0);
    expect(res.unavailable).toHaveLength(0);
  });
});
