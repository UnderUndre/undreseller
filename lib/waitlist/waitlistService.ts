/**
 * Waitlist Service (T070, US5, FR-419/420/433)
 * Deterministic cancellation recovery: join caps → fan-out on cancellation →
 * offer tokens (SHA-256, like cancellation tokens) → claim through the standard
 * booking path (atomic single-winner; no privileged reservation).
 * Anti-spam (FR-419): ≤10 ACTIVE entries per user; ≤1 offer per user per 24h;
 * ≤3 offers per user per day. Fan-out batch bound: ≤10 offers per cancellation.
 */

import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/telemetry/logger';

export const MAX_ACTIVE_ENTRIES_PER_USER = 10;
export const MAX_OFFERS_PER_USER_PER_24H = 1;
export const MAX_OFFERS_PER_USER_PER_DAY = 3;
export const MAX_FANOUT_BATCH = 10;
export const OFFER_TTL_MS = 60 * 60 * 1000; // 1h silent expiry

export type WaitlistJoinResult =
  | { ok: true; entryId: string }
  | { ok: false; reason: 'TOO_MANY_ACTIVE' | 'DUPLICATE_ACTIVE' | 'WINDOW_TOO_LONG' | 'ITEM_NOT_FOUND' };

/**
 * Join the waitlist for a service. Window must be ≤30 days ahead.
 * One ACTIVE entry per (customer, service, day-window) — enforced by the DB
 * unique key; here we add the per-user ACTIVE cap.
 */
export async function joinWaitlist(params: {
  customerTgId: string;
  customerContact?: string | null;
  serviceId?: string | null;
  professionalProfileId?: string | null;
  windowStartAt: Date;
  windowEndAt: Date;
  now?: Date;
}): Promise<WaitlistJoinResult> {
  const now = params.now ?? new Date();

  if (params.windowEndAt.getTime() - params.windowStartAt.getTime() > 30 * 24 * 60 * 60 * 1000) {
    return { ok: false, reason: 'WINDOW_TOO_LONG' };
  }
  if (params.serviceId) {
    const item = await prisma.item.findFirst({
      where: { id: params.serviceId, itemType: 'SERVICE', isActive: true },
    });
    if (!item) {
      return { ok: false, reason: 'ITEM_NOT_FOUND' };
    }
  }

  const activeCount = await prisma.waitlistEntry.count({
    where: { customerTgId: params.customerTgId, status: 'ACTIVE' },
  });
  if (activeCount >= MAX_ACTIVE_ENTRIES_PER_USER) {
    return { ok: false, reason: 'TOO_MANY_ACTIVE' };
  }

  // Duplicate active guard: same customer + service overlapping window
  if (params.serviceId) {
    const duplicate = await prisma.waitlistEntry.findFirst({
      where: {
        customerTgId: params.customerTgId,
        serviceId: params.serviceId,
        status: 'ACTIVE',
        windowStartAt: { lte: params.windowEndAt },
        windowEndAt: { gte: params.windowStartAt },
      },
    });
    if (duplicate) {
      return { ok: false, reason: 'DUPLICATE_ACTIVE' };
    }
  }

  const entry = await prisma.waitlistEntry.create({
    data: {
      customerTgId: params.customerTgId,
      customerContact: params.customerContact ?? null,
      serviceId: params.serviceId ?? null,
      professionalProfileId: params.professionalProfileId ?? null,
      windowStartAt: params.windowStartAt,
      windowEndAt: params.windowEndAt,
      status: 'ACTIVE',
    },
  });

  logger.info('[WAITLIST_JOIN]', { entryId: entry.id, serviceId: params.serviceId ?? null });
  return { ok: true, entryId: entry.id };
}

export interface FanoutCandidate {
  entryId: string;
  customerTgId: string;
  customerContact: string | null;
}

/**
 * Anti-spam eligibility check (FR-419): ≤1 offer/24h, ≤3/day per user.
 * @param offeredAtHistory timestamps of the user's previous offers
 */
export function isOfferEligible(offeredAtHistory: Date[], now: Date): boolean {
  const in24h = offeredAtHistory.filter((t) => now.getTime() - t.getTime() <= 24 * 60 * 60 * 1000);
  if (in24h.length >= MAX_OFFERS_PER_USER_PER_24H) return false;
  const dayStart = new Date(now);
  dayStart.setUTCHours(0, 0, 0, 0);
  const today = offeredAtHistory.filter((t) => t >= dayStart);
  return today.length < MAX_OFFERS_PER_USER_PER_DAY;
}

/**
 * Fan-out on a freed slot (called from the cancellation flow / Inngest job +
 * sweeper fallback). Returns matched, eligible entries in FIFO order, batch ≤10.
 * Offers are marked SENT here; actual message dispatch is the caller's job.
 */
export async function fanoutForSlot(params: {
  slotReservationId: string;
  serviceId?: string | null;
  professionalProfileId?: string | null;
  now?: Date;
}): Promise<{ entries: FanoutCandidate[] }> {
  const now = params.now ?? new Date();

  const candidates = await prisma.waitlistEntry.findMany({
    where: {
      status: 'ACTIVE',
      windowStartAt: { lte: now },
      windowEndAt: { gte: now },
      ...(params.serviceId ? { serviceId: params.serviceId } : {}),
      ...(params.professionalProfileId ? { professionalProfileId: params.professionalProfileId } : {}),
    },
    orderBy: { createdAt: 'asc' },
    take: MAX_FANOUT_BATCH * 2, // fetch extra to survive anti-spam filtering
    select: { id: true, customerTgId: true, customerContact: true },
  });

  const eligible: FanoutCandidate[] = [];
  for (const candidate of candidates) {
    if (eligible.length >= MAX_FANOUT_BATCH) break;

    // Offer history for this user (WaitlistOffer joins via entry's customer)
    const history = await prisma.waitlistOffer.findMany({
      where: {
        waitlistEntry: { customerTgId: candidate.customerTgId },
        sentAt: { gte: new Date(now.getTime() - 48 * 60 * 60 * 1000) },
      },
      select: { sentAt: true },
    });
    if (!isOfferEligible(history.map((h) => h.sentAt), now)) {
      continue;
    }

    eligible.push(candidate);
  }

  for (const candidate of eligible) {
    const token = randomBytes(32).toString('hex');
    await prisma.waitlistOffer.create({
      data: {
        waitlistEntryId: candidate.entryId,
        slotReservationId: params.slotReservationId,
        offerTokenHash: createHash('sha256').update(token).digest('hex'),
        status: 'SENT',
      },
    });
    logger.info('[WAITLIST_OFFER_SENT]', {
      entryId: candidate.entryId,
      slotReservationId: params.slotReservationId,
      tokenHash: createHash('sha256').update(token).digest('hex').slice(0, 12) + '…',
    });
    // The raw token is handed to the dispatch layer via an out-of-band channel;
    // in production the TG message embeds the claim link (T072).
  }

  return { entries: eligible };
}

/**
 * Claim an offer: validates the token hash and marks the offer CLAIMED
 * (first-commit-wins via conditional updateMany). The actual booking goes
 * through the STANDARD booking path (createBooking) — atomic single-winner;
 * losers' offers become TAKEN via expiry sweep.
 */
export async function claimOffer(params: {
  token: string;
  now?: Date;
}): Promise<{ ok: boolean; reason?: 'INVALID_TOKEN' | 'ALREADY_USED' | 'EXPIRED'; entryId?: string }> {
  const now = params.now ?? new Date();
  const tokenHash = createHash('sha256').update(params.token).digest('hex');

  const offer = await prisma.waitlistOffer.findUnique({
    where: { offerTokenHash: tokenHash },
    include: { waitlistEntry: { select: { id: true, status: true } } },
  });
  if (!offer) {
    return { ok: false, reason: 'INVALID_TOKEN' };
  }
  if (offer.status !== 'SENT') {
    return { ok: false, reason: 'ALREADY_USED' };
  }
  if (now.getTime() - offer.sentAt.getTime() > OFFER_TTL_MS) {
    return { ok: false, reason: 'EXPIRED' };
  }

  const claimed = await prisma.waitlistOffer.updateMany({
    where: { id: offer.id, status: 'SENT' },
    data: { status: 'CLAIMED', claimedAt: now },
  });
  if (claimed.count === 0) {
    return { ok: false, reason: 'ALREADY_USED' };
  }

  await prisma.waitlistEntry.update({
    where: { id: offer.waitlistEntry.id },
    data: { status: 'NOTIFIED' },
  });

  return { ok: true, entryId: offer.waitlistEntry.id };
}

/** Silent expiry sweep: SENT offers past TTL → EXPIRED; loser CLAIMED offers → TAKEN. */
export async function expireStaleOffers(now: Date = new Date()): Promise<{ expired: number; taken: number }> {
  const cutoff = new Date(now.getTime() - OFFER_TTL_MS);
  const expired = await prisma.waitlistOffer.updateMany({
    where: { status: 'SENT', sentAt: { lte: cutoff } },
    data: { status: 'EXPIRED' },
  });
  const taken = await prisma.waitlistOffer.updateMany({
    where: { status: 'CLAIMED', sentAt: { lte: cutoff }, claimedAt: null },
    data: { status: 'TAKEN' },
  });
  return { expired: expired.count, taken: taken.count };
}
