/**
 * Waitlist race suite (T073, US5, FR-420/433):
 * 1. Two concurrent claimOffer calls on the same token → exactly one CLAIMED
 *    (simulated through the conditional updateMany semantics: the mock prisma
 *    keeps real status state, so the second updateMany where status:'SENT'
 *    returns count 0 — the same guarantee as the DB conditional update).
 * 2. Offer dispatch stays within the bounded fan-out batch (≤10 offers).
 * 3. Offer expiry is silent: an EXPIRED offer claim resolves ALREADY_USED with
 *    no side effects; stale sweeps produce no slot changes.
 */

jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    item: { findFirst: jest.fn() },
    waitlistEntry: {
      count: jest.fn().mockResolvedValue(0),
      findFirst: jest.fn().mockResolvedValue(null),
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

import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '@/lib/db/prisma';
import {
  claimOffer,
  expireStaleOffers,
  fanoutForSlot,
  MAX_FANOUT_BATCH,
  OFFER_TTL_MS,
} from '@/lib/waitlist/waitlistService';

const NOW = new Date('2026-11-01T12:00:00Z');

function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

describe('Waitlist race suite (T073, FR-420/433)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('two concurrent claims on the same token → exactly one CLAIMED, loser ALREADY_USED', async () => {
    // Real state machine behind the conditional updateMany — mirrors the DB
    // guarantee: the update only lands when the row is still in `where` state.
    const offerRow = { status: 'SENT' as string };
    const token = randomBytes(32).toString('hex');

    (prisma.waitlistOffer.findUnique as jest.Mock).mockImplementation(async () => ({
      id: 'offer-1',
      status: offerRow.status,
      sentAt: NOW,
      waitlistEntry: { id: 'entry-1', status: 'ACTIVE' },
    }));
    (prisma.waitlistOffer.updateMany as jest.Mock).mockImplementation(
      async (args: { where: { id: string; status: string } }) => {
        if (offerRow.status !== args.where.status) return { count: 0 };
        offerRow.status = 'CLAIMED';
        return { count: 1 };
      }
    );

    const [a, b] = await Promise.all([
      claimOffer({ token, now: NOW }),
      claimOffer({ token, now: NOW }),
    ]);

    const winners = [a, b].filter((r) => r.ok);
    const losers = [a, b].filter((r) => !r.ok);

    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    expect(losers[0]).toEqual({ ok: false, reason: 'ALREADY_USED' });
    // Entry marked NOTIFIED exactly once (only the winner proceeds past the gate)
    expect(prisma.waitlistEntry.update).toHaveBeenCalledTimes(1);
  });

  it('dispatch batch bound: fan-out never exceeds MAX_FANOUT_BATCH offers', async () => {
    const candidates = Array.from({ length: 25 }, (_, i) => ({
      id: `entry-${i}`,
      customerTgId: `tg-${i}`,
      customerContact: null,
    }));
    (prisma.waitlistEntry.findMany as jest.Mock).mockResolvedValue(candidates);
    (prisma.waitlistOffer.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.waitlistOffer.create as jest.Mock).mockResolvedValue({ id: 'offer-1' });

    const { entries, offers } = await fanoutForSlot({ slotReservationId: 'res-1', now: NOW });

    expect(entries.length).toBeLessThanOrEqual(MAX_FANOUT_BATCH);
    expect(offers.length).toBeLessThanOrEqual(MAX_FANOUT_BATCH);
    expect(offers.length).toBe(MAX_FANOUT_BATCH);
    // Each offer carries a unique raw claim token (SHA-256 hash is the stored key)
    const tokens = new Set(offers.map((o) => o.token));
    expect(tokens.size).toBe(offers.length);
    for (const offer of offers) {
      expect(offer.token).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(prisma.waitlistOffer.create).toHaveBeenCalledTimes(MAX_FANOUT_BATCH);
  });

  it('expiry is silent: EXPIRED offer claim → ALREADY_USED with no entry side effects', async () => {
    (prisma.waitlistOffer.findUnique as jest.Mock).mockResolvedValue({
      id: 'offer-2',
      status: 'EXPIRED',
      sentAt: new Date(NOW.getTime() - OFFER_TTL_MS - 1000),
      waitlistEntry: { id: 'entry-2', status: 'ACTIVE' },
    });

    const result = await claimOffer({ token: randomBytes(32).toString('hex'), now: NOW });

    // Stale offers are swept to EXPIRED; a late claimant gets the definitive
    // "already used" outcome (task wording: EXPIRED offer claim → ALREADY_USED).
    expect(result).toEqual({ ok: false, reason: 'ALREADY_USED' });
    expect(prisma.waitlistOffer.updateMany).not.toHaveBeenCalled();
    expect(prisma.waitlistEntry.update).not.toHaveBeenCalled();
  });

  it('expiry sweep is silent and side-effect-bounded (updateMany counts only)', async () => {
    (prisma.waitlistOffer.updateMany as jest.Mock)
      .mockResolvedValueOnce({ count: 3 }) // SENT → EXPIRED
      .mockResolvedValueOnce({ count: 1 }); // loser CLAIMED → TAKEN

    const result = await expireStaleOffers(NOW);

    expect(result).toEqual({ expired: 3, taken: 1 });
    expect(prisma.waitlistOffer.updateMany).toHaveBeenNthCalledWith(1, {
      where: { status: 'SENT', sentAt: { lte: new Date(NOW.getTime() - OFFER_TTL_MS) } },
      data: { status: 'EXPIRED' },
    });
    expect(prisma.waitlistOffer.updateMany).toHaveBeenNthCalledWith(2, {
      where: { status: 'CLAIMED', sentAt: { lte: new Date(NOW.getTime() - OFFER_TTL_MS) }, claimedAt: null },
      data: { status: 'TAKEN' },
    });
  });

  it('token hash contract: claimOffer resolves offers by SHA-256 of the raw token', async () => {
    const token = randomBytes(32).toString('hex');
    (prisma.waitlistOffer.findUnique as jest.Mock).mockResolvedValue(null);

    await claimOffer({ token, now: NOW });

    expect(prisma.waitlistOffer.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { offerTokenHash: tokenHash(token) } })
    );
    expect(await claimOffer({ token, now: NOW })).toEqual({ ok: false, reason: 'INVALID_TOKEN' });
  });
});
