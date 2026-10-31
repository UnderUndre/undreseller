/**
 * OAuth CSRF state store (research D5): in-memory, single-instance canon
 * (NFR-03 / REPLICA_COUNT=1), one-time, TTL 10 min.
 */

export interface GcalOAuthState {
  resourceId: string | null;
  connectedByStaffId: string;
  expiresAt: number;
}

const STATE_TTL_MS = 10 * 60 * 1000;
const states = new Map<string, GcalOAuthState>();

// Bounded store: purge expired entries opportunistically
function purgeExpired(): void {
  const now = Date.now();
  for (const [key, value] of states) {
    if (value.expiresAt < now) states.delete(key);
  }
}

export function createOAuthState(resourceId: string | null, staffId: string): string {
  purgeExpired();
  const state = crypto.randomUUID();
  states.set(state, { resourceId, connectedByStaffId: staffId, expiresAt: Date.now() + STATE_TTL_MS });
  return state;
}

/** One-time consume: valid → state data, otherwise null (unknown/expired/replayed). */
export function consumeOAuthState(state: string): GcalOAuthState | null {
  purgeExpired();
  const value = states.get(state);
  if (!value) return null;
  states.delete(state);
  if (value.expiresAt < Date.now()) return null;
  return value;
}

export function resetOAuthStateStoreForTests(): void {
  states.clear();
}
