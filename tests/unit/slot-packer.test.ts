jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    slotReservation: { findMany: jest.fn().mockResolvedValue([]) },
  },
}));

import { packAnyAvailable, type SlotCandidate } from '@/lib/waitlist/slotPacker';

function slot(startsAt: string, performerId: string, extra: Partial<SlotCandidate> = {}): SlotCandidate {
  return { startsAt, performerId, ...extra } as SlotCandidate;
}

describe('Any-Available Slot Packer (T071, FR-421)', () => {
  it('history-ranked-first: returning customer performer outranks a sooner stranger', () => {
    const ordered = packAnyAvailable(
      [
        slot('2026-11-01T10:00:00Z', 'stranger-a'),
        slot('2026-11-01T11:00:00Z', 'my-master'),
      ],
      { historyPerformerIds: ['my-master'], shortestServiceMin: 15 }
    );
    expect(ordered[0].performerId).toBe('my-master');
  });

  it('earliest-start greedy within the same rank bucket', () => {
    const ordered = packAnyAvailable(
      [
        slot('2026-11-01T12:00:00Z', 'a'),
        slot('2026-11-01T10:00:00Z', 'b'),
        slot('2026-11-01T11:00:00Z', 'c'),
      ],
      { historyPerformerIds: [], shortestServiceMin: 15 }
    );
    expect(ordered.map((s) => s.startsAt)).toEqual([
      '2026-11-01T10:00:00Z',
      '2026-11-01T11:00:00Z',
      '2026-11-01T12:00:00Z',
    ]);
  });

  it('gap penalty: non-fragmenting slot wins the tie over a gap > shortest service', () => {
    const ordered = packAnyAvailable(
      [
        slot('2026-11-01T10:00:00Z', 'a', { gapMin: 60 } as never),
        slot('2026-11-01T10:00:00Z', 'b', { gapMin: 10 } as never),
      ],
      { historyPerformerIds: [], shortestServiceMin: 15 }
    );
    expect(ordered[0].performerId).toBe('b');
  });

  it('two history performers rank by recency (most recent booking first)', () => {
    const ordered = packAnyAvailable(
      [
        slot('2026-11-01T10:00:00Z', 'old-master'),
        slot('2026-11-01T09:00:00Z', 'new-master'),
      ],
      { historyPerformerIds: ['new-master', 'old-master'], shortestServiceMin: 15 }
    );
    expect(ordered.map((s) => s.performerId)).toEqual(['new-master', 'old-master']);
  });

  it('does not mutate the input array (pure)', () => {
    const input = [slot('2026-11-01T12:00:00Z', 'a'), slot('2026-11-01T10:00:00Z', 'b')];
    const copy = [...input];
    packAnyAvailable(input, { historyPerformerIds: [], shortestServiceMin: 15 });
    expect(input).toEqual(copy);
  });
});
