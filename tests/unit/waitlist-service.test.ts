jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    item: { findFirst: jest.fn() },
    waitlistEntry: {
      count: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn().mockResolvedValue({ id: 'entry-1' }),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
    },
    waitlistOffer: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 'offer-1' }),
      findUnique: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  },
}));

jest.mock('@/lib/telemetry/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { prisma } from '@/lib/db/prisma';

import {
  claimOffer,
  expireStaleOffers,
  fanoutForSlot,
  isOfferEligible,
  joinWaitlist,
  MAX_ACTIVE_ENTRIES_PER_USER,
  MAX_FANOUT_BATCH,
  MAX_OFFERS_PER_USER_PER_24H,
  MAX_OFFERS_PER_USER_PER_DAY,
  OFFER_TTL_MS,
} from '@/lib/waitlist/waitlistService';

const baseWindow = {
  windowStartAt: new Date('2026-11-01T00:00:00Z'),
  windowEndAt: new Date('2026-11-03T00:00:00Z'),
};

describe('Waitlist Service (T070, FR-419/420/433)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('join: rejects >30-day windows and unknown services', async () => {
    const tooLong = await joinWaitlist({
      customerTgId: 'tg-1',
      ...baseWindow,
      windowEndAt: new Date('2026-12-05T00:00:00Z'),
    });
    expect(tooLong).toEqual({ ok: false, reason: 'WINDOW_TOO_LONG' });

    (prisma.item.findFirst as jest.Mock).mockResolvedValue(null);
    const unknown = await joinWaitlist({ customerTgId: 'tg-1', serviceId: 'nope', ...baseWindow });
    expect(unknown).toEqual({ ok: false, reason: 'ITEM_NOT_FOUND' });
  });

  it(`join: enforces ≤${MAX_ACTIVE_ENTRIES_PER_USER} ACTIVE entries per user`, async () => {
    (prisma.waitlistEntry.count as jest.Mock).mockResolvedValue(MAX_ACTIVE_ENTRIES_PER_USER);
    const result = await joinWaitlist({ customerTgId: 'tg-1', ...baseWindow });
    expect(result).toEqual({ ok: false, reason: 'TOO_MANY_ACTIVE' });

    (prisma.waitlistEntry.count as jest.Mock).mockResolvedValue(0);
    const ok = await joinWaitlist({ customerTgId: 'tg-1', ...baseWindow });
    expect(ok).toEqual({ ok: true, entryId: 'entry-1' });
  });

  it('join: rejects duplicate ACTIVE entry for the same service + overlapping window', async () => {
    (prisma.item.findFirst as jest.Mock).mockResolvedValue({ id: 'svc-1' });
    (prisma.waitlistEntry.count as jest.Mock).mockResolvedValue(0);
    (prisma.waitlistEntry.findFirst as jest.Mock).mockResolvedValue({ id: 'dup' });
    const result = await joinWaitlist({ customerTgId: 'tg-1', serviceId: 'svc-1', ...baseWindow });
    expect(result).toEqual({ ok: false, reason: 'DUPLICATE_ACTIVE' });
  });

  it('anti-spam eligibility: ≤1 offer/24h, ≤3/day', () => {
    const now = new Date('2026-11-01T12:00:00Z');
    expect(isOfferEligible([], now)).toBe(true);
    // one offer 2h ago → blocked by 24h cap
    expect(
      isOfferEligible([new Date('2026-11-01T10:00:00Z')], now)
    ).toBe(false);
    // one offer yesterday → OK for 24h cap, but 3 same-day offers block
    expect(isOfferEligible([new Date('2026-10-31T10:00:00Z')], now)).toBe(true);
    expect(
      isOfferEligible(
        [
          new Date('2026-11-01T01:00:00Z'),
          new Date('2026-11-01T05:00:00Z'),
          new Date('2026-11-01T09:00:00Z'),
        ],
        now
      )
    ).toBe(false);
    expect(MAX_OFFERS_PER_USER_PER_24H).toBe(1);
    expect(MAX_OFFERS_PER_USER_PER_DAY).toBe(3);
  });

  it('fan-out: FIFO eligible candidates, batch ≤10, offers SENT with hashed tokens', async () => {
    (prisma.waitlistEntry.findMany as jest.Mock).mockResolvedValue(
      Array.from({ length: 12 }, (_, i) => ({
        id: `e-${i}`,
        customerTgId: `tg-${i}`,
        customerContact: null,
      }))
    );
    (prisma.waitlistOffer.findMany as jest.Mock).mockResolvedValue([]);

    const { entries } = await fanoutForSlot({ slotReservationId: 'res-1' });

    expect(entries.length).toBeLessThanOrEqual(MAX_FANOUT_BATCH);
    expect(prisma.waitlistOffer.create).toHaveBeenCalledTimes(entries.length);
    const created = (prisma.waitlistOffer.create as jest.Mock).mock.calls[0][0];
    expect(created.data.offerTokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(created.data.status).toBe('SENT');
  });

  it('fan-out: anti-spam filter skips users who were offered within 24h', async () => {
    (prisma.waitlistEntry.findMany as jest.Mock).mockResolvedValue([
      { id: 'e-1', customerTgId: 'tg-1', customerContact: null },
      { id: 'e-2', customerTgId: 'tg-2', customerContact: null },
    ]);
    // tg-1 was offered 2h ago
    (prisma.waitlistOffer.findMany as jest.Mock).mockImplementation(
      (args: { where: { waitlistEntry: { customerTgId: string } } }) =>
        args.where.waitlistEntry.customerTgId === 'tg-1'
          ? [{ sentAt: new Date(Date.now() - 2 * 60 * 60 * 1000) }]
          : []
    );

    const { entries } = await fanoutForSlot({ slotReservationId: 'res-1' });
    expect(entries.map((e) => e.customerTgId)).toEqual(['tg-2']);
  });

  it('claim: first-commit-wins via conditional update; invalid/used/expired rejected', async () => {
    (prisma.waitlistOffer.findUnique as jest.Mock).mockResolvedValue(null);
    expect(await claimOffer({ token: 'ghost' })).toEqual({ ok: false, reason: 'INVALID_TOKEN' });

    (prisma.waitlistOffer.findUnique as jest.Mock).mockResolvedValue({
      id: 'o-1',
      status: 'CLAIMED',
      sentAt: new Date(),
      waitlistEntry: { id: 'e-1', status: 'ACTIVE' },
    });
    expect(await claimOffer({ token: 'used' })).toEqual({ ok: false, reason: 'ALREADY_USED' });

    (prisma.waitlistOffer.findUnique as jest.Mock).mockResolvedValue({
      id: 'o-1',
      status: 'SENT',
      sentAt: new Date(Date.now() - OFFER_TTL_MS - 1000),
      waitlistEntry: { id: 'e-1', status: 'ACTIVE' },
    });
    expect(await claimOffer({ token: 'old' })).toEqual({ ok: false, reason: 'EXPIRED' });

    (prisma.waitlistOffer.findUnique as jest.Mock).mockResolvedValue({
      id: 'o-1',
      status: 'SENT',
      sentAt: new Date(),
      waitlistEntry: { id: 'e-1', status: 'ACTIVE' },
    });
    // Losing race: another transaction already flipped the status
    (prisma.waitlistOffer.updateMany as jest.Mock).mockResolvedValueOnce({ count: 0 });
    expect(await claimOffer({ token: 'raced' })).toEqual({ ok: false, reason: 'ALREADY_USED' });

    (prisma.waitlistOffer.updateMany as jest.Mock).mockResolvedValueOnce({ count: 1 });
    expect(await claimOffer({ token: 'winner' })).toEqual({ ok: true, entryId: 'e-1' });
  });

  it('expiry sweep: SENT past TTL → EXPIRED', async () => {
    (prisma.waitlistOffer.updateMany as jest.Mock)
      .mockResolvedValueOnce({ count: 4 })
      .mockResolvedValueOnce({ count: 1 });
    const result = await expireStaleOffers();
    expect(result).toEqual({ expired: 4, taken: 1 });
  });
});
