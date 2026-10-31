/**
 * FSM→GC decision table (T012, FR-602). Pure function, canon
 * `contracts/gcal-adapter.md` §2 — no I/O, no mocks needed in tests.
 *
 * Push worker (gcalPush) consumes FSM transitions from the 004 outbox and
 * asks this table what to do in Google Calendar. Idempotency (replays →
 * upsert semantics) is enforced by `extendedProperties.private.
 * undresellerOrderId` at the GC side; the table itself is deterministic.
 */

/** DB-термины 004 FSM (канон) */
export type OrderStatusInput =
  | 'BOOKED'
  | 'CANCELLED'
  | 'UNDERPAID'
  | 'PAYMENT_PENDING'
  | 'PAYMENT_EXPIRED';

/** FSM-переход, попавший в outbox (канон 004 InboxEvent). */
export interface FsmTransitionInput {
  orderId: string;
  /** Post-transition status. */
  toStatus: OrderStatusInput | 'RESERVATION_RELEASED';
  /**
   * Was a GC event previously pushed for this order? (push worker tracks
   * this via a GC-side lookup by extendedProperties, not stored in DB —
   * data-model §2: source of truth for the mapping is always our orderId)
   */
  hadGcEvent: boolean;
  /** True when the reservation was RELEASED due to PAID_REQUIRES_RESOLUTION
   * collision / admin cancellation while an event exists (BLOCKER-2 path). */
  reservationReleased?: boolean;
  /** scheduleVersion CAS bump = reschedule (time PATCH). */
  rescheduled?: boolean;
  /** Meet conferencing ⇔ Item.remoteMeetingEnabled (resolved by the worker). */
  remoteMeetingEnabled?: boolean;
  /** PushEventInput payload for CREATE (worker supplies details). */
  event?: {
    serviceTitle: string;
    orderNumber: string;
    startsAtUtc: string;
    endsAtUtc: string;
    description: string;
    resourceId: string | null;
  };
  /** PATCH payload for reschedule (worker supplies new times). */
  patch?: { startsAtUtc: string; endsAtUtc: string };
}

export type GcAction =
  | { kind: 'CREATE'; payload: NonNullable<FsmTransitionInput['event']> & { meet: boolean } }
  | { kind: 'PATCH'; payload: NonNullable<FsmTransitionInput['patch']> }
  | { kind: 'DELETE'; orderId: string }
  | { kind: 'NOOP'; reason: string };

/**
 * Decision table (contract §2):
 *
 * | transition                          | had event | action            |
 * | → BOOKED (first push)               | no        | CREATE            |
 * | → BOOKED (replay / after transfer)  | yes       | upsert → CREATE*  |
 * | reschedule (scheduleVersion ↑)      | yes       | PATCH (404→CREATE at worker) |
 * | → CANCELLED (any reason)            | yes       | DELETE            |
 * | reservation RELEASED with event     | yes       | DELETE + audit    |
 * | UNDERPAID / PAYMENT_PENDING / PAYMENT_EXPIRED | — | NOOP      |
 */
export function mapFsmToGcAction(transition: FsmTransitionInput): GcAction {
  // reservation RELEASED while an event is alive (PAID_REQUIRES_RESOLUTION
  // collision / admin cancellation) — audit-worthy delete path (BLOCKER-2)
  if (transition.toStatus === 'RESERVATION_RELEASED') {
    if (transition.hadGcEvent) {
      return { kind: 'DELETE', orderId: transition.orderId };
    }
    return { kind: 'NOOP', reason: 'released_without_event' };
  }

  if (transition.toStatus === 'CANCELLED') {
    if (transition.hadGcEvent) {
      return { kind: 'DELETE', orderId: transition.orderId };
    }
    return { kind: 'NOOP', reason: 'cancelled_without_event' };
  }

  if (transition.toStatus === 'BOOKED') {
    // Reschedule with a live event → PATCH time (worker falls back to
    // re-CREATE on 404 if the master deleted the event in GC — F3-rev).
    if (transition.rescheduled && transition.hadGcEvent && transition.patch) {
      return { kind: 'PATCH', payload: transition.patch };
    }
    // First push, replays and post-transfer re-pushes: upsert semantics by
    // extendedProperties.undresellerOrderId — CREATE is idempotent at worker.
    if (transition.event) {
      return {
        kind: 'CREATE',
        payload: { ...transition.event, meet: transition.remoteMeetingEnabled === true },
      };
    }
    return { kind: 'NOOP', reason: 'booked_without_payload' };
  }

  // UNDERPAID / PAYMENT_PENDING / PAYMENT_EXPIRED → no event exists
  return { kind: 'NOOP', reason: `push_only_on_booked:${transition.toStatus}` };
}
