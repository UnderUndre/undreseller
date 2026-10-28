/**
 * Staff bot destructive-action confirm barrier (T093, FR-429).
 *
 * Destructive actions (reject, blacklist — i.e. approve-with-blacklist) are
 * NOT executed on first press: the first press arms a pending confirmation
 * and the staff member is shown an alert asking to press the same button
 * again within the 30-second window. The second press inside the window
 * confirms and the action executes; an expired pending state re-arms.
 *
 * State is a bounded in-memory Map keyed by `action:orderId` — pending
 * confirmations are single-instance transient state (same OPS constraints
 * as lib/security/rateLimit.ts, REPLICA_COUNT=1).
 */

export const CONFIRM_WINDOW_MS = 30_000;
/** Upper bound on tracked pending confirmations (bounded memory). */
const MAX_PENDING = 1_000;

export type ConfirmBarrierResult = 'REQUIRES_CONFIRMATION' | 'CONFIRMED';

const pending = new Map<string, number>();

function pendingKey(action: string, orderId: string): string {
  return `${action}:${orderId}`;
}

/**
 * Two-press barrier. Call before executing a destructive staff action.
 * First press → 'REQUIRES_CONFIRMATION' (state armed).
 * Second press within CONFIRM_WINDOW_MS → 'CONFIRMED' (state consumed).
 * Second press after expiry → 'REQUIRES_CONFIRMATION' (re-armed).
 */
export function awaitConfirmBarrier(
  action: string,
  orderId: string,
  now: number = Date.now()
): ConfirmBarrierResult {
  const key = pendingKey(action, orderId);
  const armedAt = pending.get(key);

  if (armedAt !== undefined && now - armedAt <= CONFIRM_WINDOW_MS) {
    pending.delete(key);
    return 'CONFIRMED';
  }

  while (pending.size >= MAX_PENDING) {
    const oldest = pending.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    pending.delete(oldest);
  }
  pending.set(key, now);
  return 'REQUIRES_CONFIRMATION';
}

/** Test/ops helper: drop all pending confirmations. */
export function resetPendingConfirmations(): void {
  pending.clear();
}

/** Test/ops helper: whether a confirmation is currently armed. */
export function isConfirmPending(action: string, orderId: string): boolean {
  return pending.has(pendingKey(action, orderId));
}

/** Destructive actions that require the confirm barrier (FR-429). */
export function isDestructiveStaffAction(action: string): boolean {
  return action === 'reject' || action === 'blacklist';
}
