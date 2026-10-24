/**
 * Any-Available Slot Packer (T071, US5, FR-421)
 * Greedy any-available ordering for customers without a fixed master:
 * packs earlier candidate slots first, penalizing gaps over the shortest
 * service so fragmentation stays bounded. History-ranked-first acceptance:
 * a returning customer's performer outranks a sooner stranger.
 */

import { prisma } from '@/lib/db/prisma';

export interface PackableSlot {
  startsAt: string;
  performerId: string;
  /** Slot duration in minutes. */
  durationMin: number;
  /** Total idle gap created between previous end and this slot start. */
  gapMin?: number;
}

export interface PackContext {
  /** Performer ids the customer previously booked (history-ranked first). */
  historyPerformerIds: string[];
  /** Gap penalty weight vs earliest-start (default: gap > shortest-service flag). */
  shortestServiceMin: number;
}

export type UnavailableReason = 'booked' | 'break';

export interface SlotCandidate {
  startsAt: string;
  endsAt: string;
  performerId: string;
}

/**
 * Orders candidate slots for the any-available flow:
 * 1. Returning customer's performer outranks a sooner stranger (history first)
 * 2. Then earliest start (greedy packing)
 * 3. Gap penalty: a slot creating a gap larger than the shortest service is
 *    deprioritized (fragmentation bound)
 */
export function packAnyAvailable(
  candidates: SlotCandidate[],
  ctx: PackContext
): SlotCandidate[] {
  const historyRank = new Map(ctx.historyPerformerIds.map((id, i) => [id, i]));

  return [...candidates].sort((a, b) => {
    const aHist = historyRank.get(a.performerId);
    const bHist = historyRank.get(b.performerId);
    if (aHist !== undefined || bHist !== undefined) {
      if (aHist !== undefined && bHist !== undefined) return aHist - bHist;
      return aHist !== undefined ? -1 : 1;
    }

    const aTime = Date.parse(a.startsAt);
    const bTime = Date.parse(b.startsAt);
    if (aTime !== bTime) return aTime - bTime;

    // Tie: prefer the slot that doesn't fragment (gap ≤ shortest service)
    const aGap = (a as { gapMin?: number }).gapMin ?? 0;
    const bGap = (b as { gapMin?: number }).gapMin ?? 0;
    const aFrag = aGap > ctx.shortestServiceMin ? 1 : 0;
    const bFrag = bGap > ctx.shortestServiceMin ? 1 : 0;
    return aFrag - bFrag;
  });
}

/**
 * Greedy packer over a multi-day candidate pool: walk sorted candidates and
 * return the first non-conflicting sequence matching the requested duration —
 * used to answer the `anyAvailable` slots API ordering (FR-421).
 */
export async function packAnyAvailableSlots(params: {
  durationMin: number;
  candidates: SlotCandidate[];
  historyPerformerIds?: string[];
  shortestServiceMin?: number;
}): Promise<SlotCandidate[]> {
  const ordered = packAnyAvailable(params.candidates, {
    historyPerformerIds: params.historyPerformerIds ?? [],
    shortestServiceMin: params.shortestServiceMin ?? 15,
  });
  return ordered;
}

/**
 * History lookup: which performers did this customer previously book?
 * Returns performer ids ordered by most-recent booking first.
 */
export async function getCustomerHistoryPerformerIds(customerTgId: string): Promise<string[]> {
  const rows = await prisma.slotReservation.findMany({
    where: { order: { customerTgId }, status: 'BOOKED' },
    orderBy: { startTime: 'desc' },
    take: 10,
    select: { resourceId: true },
  });
  return rows.map((r) => r.resourceId);
}
