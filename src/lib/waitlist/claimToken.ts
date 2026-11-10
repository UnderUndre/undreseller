import { hashToken, verifyTokenHash } from '@/lib/booking/tokens'

/**
 * Waitlist tokens (spec 006 T611, research D2): computed HMACs — nothing
 * secret stored. Two SEPARATE tokens (review F10):
 * - claim token binds entryId + campaignCount + slotStartIso (review F1) and
 *   is only valid within the 30-minute campaign;
 * - unsubscribe token is valid for the whole life of the entry (no TTL) —
 *   a client must always be able to leave the queue.
 */

export function computeClaimToken(entryId: string | number, campaignCount: number, slotStartIso: string): string {
  return hashToken(`waitlist-claim:v${campaignCount}:${entryId}:${slotStartIso}`)
}

export function verifyClaimToken(
  entryId: string | number,
  campaignCount: number,
  slotStartIso: string,
  provided: string | null | undefined,
): boolean {
  if (!provided) return false
  return verifyTokenHash(`waitlist-claim:v${campaignCount}:${entryId}:${slotStartIso}`, provided)
}

export function computeUnsubscribeToken(entryId: string | number): string {
  return hashToken(`waitlist-unsub:${entryId}`)
}

export function verifyUnsubscribeToken(
  entryId: string | number,
  provided: string | null | undefined,
): boolean {
  if (!provided) return false
  return verifyTokenHash(`waitlist-unsub:${entryId}`, provided)
}
