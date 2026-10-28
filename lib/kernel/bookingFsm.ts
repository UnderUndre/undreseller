/**
 * Booking FSM — pure two-track transition functions (T020, data-model §2.1)
 * Requirements: FR-337, FR-338, FR-404, FR-407, FR-432, FR-433, FR-444
 * Standards: NIST SP 800-218 SSDF & ISO/IEC/IEEE 12207:2017
 *
 * PURE module: no Prisma, no IO, no clocks — `now` is always injected.
 *
 * Track semantics (data-model §2.1):
 *   FREE:    AVAILABLE → CONFIRMED (IN_CALL auto, unless instance approval flag)
 *            AVAILABLE → PENDING_APPROVAL → CONFIRMED (OUT_CALL always; IN_CALL when flag on)
 *            PENDING_APPROVAL → AVAILABLE (staff reject / customer cancel)
 *   PREPAID: AVAILABLE → HELD (TTL 15m) → PAYMENT_PENDING → CONFIRMED
 *            HELD|PAYMENT_PENDING → AVAILABLE (TTL expired / gateway failed|expired)
 *            PAYMENT_PENDING → UNDERPAID (partially_paid; staff resolution; NO auto-confirm)
 *            PAYMENT_PENDING frozen on confirming (holdFrozenAt set; TTL suspended)
 *            late finished after re-book → order PAID_REQUIRES_RESOLUTION + refund (FR-432)
 *
 * Name mapping (data-model §1.1, antigravity F1): the spec-level state CONFIRMED
 * maps to the existing DB enum value BOOKED — no CONFIRMED value exists in the
 * `ReservationStatus` DB enum. Translation happens at the service boundary via
 * SPEC_TO_DB_RESERVATION_STATUS / DB_TO_SPEC_BOOKING_STATE. Spec-level AVAILABLE
 * maps to DB RELEASED (slot freed) — AVAILABLE is not stored either.
 */

// ---------------------------------------------------------------------------
// States
// ---------------------------------------------------------------------------

/** Spec-level booking FSM states. CONFIRMED↔BOOKED and AVAILABLE↔RELEASED are translated at the service boundary. */
export type BookingFsmState =
  | 'AVAILABLE'
  | 'HELD'
  | 'PAYMENT_PENDING'
  | 'UNDERPAID'
  | 'PENDING_APPROVAL'
  | 'CONFIRMED';

export type BookingTrack = 'FREE' | 'PREPAID';

/** DB `ReservationStatus` values (prisma enum). */
export type DbReservationStatus =
  | 'HELD'
  | 'BOOKED'
  | 'RELEASED'
  | 'PAYMENT_PENDING'
  | 'UNDERPAID'
  | 'PENDING_APPROVAL'
  | 'CANCELLED'
  | 'STAFF_REJECTED';

/**
 * Spec-level CONFIRMED maps to DB BOOKED; AVAILABLE maps to DB RELEASED
 * (the slot row leaves the active set). PENDING_APPROVAL / UNDERPAID /
 * PAYMENT_PENDING are stored verbatim. DB CANCELLED / STAFF_REJECTED are
 * terminal release flavors written via `effects.release`.
 */
export const SPEC_TO_DB_RESERVATION_STATUS: Record<BookingFsmState, DbReservationStatus> = {
  AVAILABLE: 'RELEASED',
  HELD: 'HELD',
  PAYMENT_PENDING: 'PAYMENT_PENDING',
  UNDERPAID: 'UNDERPAID',
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  CONFIRMED: 'BOOKED',
};

export const DB_TO_SPEC_BOOKING_STATE: Record<DbReservationStatus, BookingFsmState | null> = {
  HELD: 'HELD',
  BOOKED: 'CONFIRMED',
  RELEASED: 'AVAILABLE',
  PAYMENT_PENDING: 'PAYMENT_PENDING',
  UNDERPAID: 'UNDERPAID',
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  CANCELLED: 'AVAILABLE',
  STAFF_REJECTED: 'AVAILABLE',
};

// ---------------------------------------------------------------------------
// Timing constants (data-model §1.1 / §2.1)
// ---------------------------------------------------------------------------

/** Prepaid hold TTL: 15 minutes (FR-433). */
export const PREPAID_HOLD_TTL_MS = 15 * 60 * 1000;
/** Hard confirming-freeze ceiling: 24 h — past it the hold expires and order goes to FR-432 resolution. */
export const MAX_CONFIRMING_FREEZE_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export type BookingFsmEvent =
  | 'CREATE_BOOKING'
  | 'STAFF_APPROVE'
  | 'STAFF_REJECT'
  | 'CUSTOMER_CANCEL'
  | 'TTL_EXPIRED'
  | 'GATEWAY_WAITING'
  | 'GATEWAY_CONFIRMING'
  | 'GATEWAY_FINISHED'
  | 'GATEWAY_PARTIALLY_PAID'
  | 'GATEWAY_FAILED'
  | 'GATEWAY_EXPIRED'
  | 'STAFF_RESOLVE_CONFIRM'
  | 'STAFF_RESOLVE_CANCEL';

export interface BookingFsmContext {
  /** Injected clock — the FSM itself is deterministic and pure. */
  now: Date;
  /** Track selection: prepaid when the Item has requiresFullPrepayment (FR-407). */
  track?: BookingTrack;
  /** Instance flag requireStaffApprovalForInCall (OUT_CALL is always true). */
  requiresApproval?: boolean;
  /** Current hold deadline, when transitioning from a persisted hold. */
  holdExpiresAt?: Date | null;
  /** Current freeze timestamp, when transitioning from a persisted frozen hold. */
  holdFrozenAt?: Date | null;
  /** Override for the prepaid TTL (tests); defaults to PREPAID_HOLD_TTL_MS. */
  ttlMs?: number;
  /**
   * Late-payment disambiguation for GATEWAY_FINISHED when the reservation was
   * already released (FR-444 / FR-432): slot still free → atomic re-confirm;
   * slot re-booked → PAID_REQUIRES_RESOLUTION + refund request.
   */
  slotReleased?: boolean;
  slotRebooked?: boolean;
}

export type ReleaseFlavor = 'RELEASED' | 'CANCELLED' | 'STAFF_REJECTED';

export interface FsmEffects {
  /** When true the slot row leaves the active set (release flavor in `release`). */
  release?: ReleaseFlavor;
  /** holdFrozenAt write: null clears the freeze, a Date sets/keeps it. Omitted = untouched. */
  holdFrozenAt?: Date | null;
  /** holdExpiresAt write: null clears the TTL, a Date sets it. Omitted = untouched. */
  holdExpiresAt?: Date | null;
  /** Order-level outcome when a payment lands outside the normal path. */
  orderResolution?: 'NONE' | 'FR432_REFUND_24H';
  /** Atomic re-confirm of a released booking whose payment finished late (FR-444). */
  lateReconfirm?: boolean;
}

export type FsmTransitionResult =
  | { ok: true; state: BookingFsmState; effects: FsmEffects }
  | { ok: false; reason: string };

// ---------------------------------------------------------------------------
// Pure helpers (consumed by service layer + sweepers, T023)
// ---------------------------------------------------------------------------

/**
 * TTL sweep suppression while a hold is frozen on gateway `confirming`.
 * The freeze suspends the TTL; the hard ceiling (24 h) is checked separately.
 */
export function isHoldTtlSweepSuppressed(params: {
  holdFrozenAt?: Date | null;
  now: Date;
}): boolean {
  if (!params.holdFrozenAt) return false;
  return params.now.getTime() - params.holdFrozenAt.getTime() < MAX_CONFIRMING_FREEZE_MS;
}

/** True when the confirming freeze has exceeded MAX_CONFIRMING_FREEZE (24 h). */
export function isConfirmingFreezeCeilingExceeded(params: {
  holdFrozenAt?: Date | null;
  now: Date;
}): boolean {
  if (!params.holdFrozenAt) return false;
  return params.now.getTime() - params.holdFrozenAt.getTime() >= MAX_CONFIRMING_FREEZE_MS;
}

export type HoldExpiryVerdict =
  | 'NOT_HOLD'
  | 'ACTIVE'
  | 'EXPIRED'
  | 'FROZEN'
  | 'FREEZE_CEILING_EXCEEDED';

/**
 * Evaluates a persisted hold against the TTL + freeze rules:
 * - no hold deadline → NOT_HOLD (legacy PENDING_APPROVAL rows, never auto-cancel);
 * - frozen and within ceiling → FROZEN (TTL suspended — sweep must skip);
 * - frozen past ceiling → FREEZE_CEILING_EXCEEDED (hold expires, FR-432 resolution);
 * - past holdExpiresAt → EXPIRED; otherwise ACTIVE.
 */
export function evaluateHoldExpiry(params: {
  status: BookingFsmState;
  holdExpiresAt?: Date | null;
  holdFrozenAt?: Date | null;
  now: Date;
}): HoldExpiryVerdict {
  if (params.status !== 'HELD' && params.status !== 'PAYMENT_PENDING') return 'NOT_HOLD';
  if (params.holdFrozenAt) {
    return isConfirmingFreezeCeilingExceeded(params)
      ? 'FREEZE_CEILING_EXCEEDED'
      : 'FROZEN';
  }
  if (!params.holdExpiresAt) return 'ACTIVE';
  return params.holdExpiresAt.getTime() <= params.now.getTime() ? 'EXPIRED' : 'ACTIVE';
}

// ---------------------------------------------------------------------------
// Core transition function
// ---------------------------------------------------------------------------

const NO_EFFECTS: FsmEffects = {};

function ok(state: BookingFsmState, effects: FsmEffects = NO_EFFECTS): FsmTransitionResult {
  return { ok: true, state, effects };
}

function reject(reason: string): FsmTransitionResult {
  return { ok: false, reason };
}

/**
 * Pure two-track booking FSM transition (data-model §2.1).
 * Every state change of a booking MUST go through this function; the service
 * layer wraps calls in the advisory-lock transaction and persists the returned
 * state/effects.
 */
export function transitionBookingFsm(
  state: BookingFsmState,
  event: BookingFsmEvent,
  context: BookingFsmContext
): FsmTransitionResult {
  switch (state) {
    case 'AVAILABLE':
      return transitionFromAvailable(event, context);

    case 'HELD':
      return transitionFromHeld(event, context);

    case 'PAYMENT_PENDING':
      return transitionFromPaymentPending(event, context);

    case 'PENDING_APPROVAL':
      return transitionFromPendingApproval(event);

    case 'UNDERPAID':
      return transitionFromUnderpaid(event);

    case 'CONFIRMED':
      // Terminal for the normal flow. A late gateway FINISHED after the slot
      // was released is handled from AVAILABLE (the reservation row is gone);
      // CONFIRMED + any event here is a no-op/reject — no double-confirm.
      return reject(`Invalid event '${event}' for terminal state CONFIRMED`);

    default: {
      const exhaustive: never = state;
      return reject(`Unknown booking FSM state: ${String(exhaustive)}`);
    }
  }
}

function transitionFromAvailable(
  event: BookingFsmEvent,
  ctx: BookingFsmContext
): FsmTransitionResult {
  switch (event) {
    case 'CREATE_BOOKING': {
      if (ctx.track === 'PREPAID') {
        const ttlMs = ctx.ttlMs ?? PREPAID_HOLD_TTL_MS;
        return ok('HELD', {
          holdExpiresAt: new Date(ctx.now.getTime() + ttlMs),
          holdFrozenAt: null,
        });
      }
      if (ctx.requiresApproval) {
        return ok('PENDING_APPROVAL', { holdExpiresAt: null, holdFrozenAt: null });
      }
      return ok('CONFIRMED', { holdExpiresAt: null, holdFrozenAt: null });
    }

    case 'GATEWAY_FINISHED': {
      // Late payment on a released reservation (FR-444 / FR-432).
      if (ctx.slotRebooked) {
        // Slot already taken by another customer: order → PAID_REQUIRES_RESOLUTION,
        // RefundOperation with 24 h SLA (existing fulfillment path codifies this).
        return ok('AVAILABLE', { orderResolution: 'FR432_REFUND_24H' });
      }
      if (ctx.slotReleased) {
        // Slot still FREE: atomic re-confirm — no refund path.
        return ok('CONFIRMED', { lateReconfirm: true, holdExpiresAt: null, holdFrozenAt: null });
      }
      return reject('GATEWAY_FINISHED on AVAILABLE requires slotReleased or slotRebooked context');
    }

    default:
      return reject(`Invalid event '${event}' for state AVAILABLE`);
  }
}

function transitionFromHeld(event: BookingFsmEvent, ctx: BookingFsmContext): FsmTransitionResult {
  switch (event) {
    case 'GATEWAY_WAITING':
      // Gateway invoice acknowledged; hold continues under the payment TTL.
      return ok('PAYMENT_PENDING');

    case 'GATEWAY_CONFIRMING':
      // First `confirming`: freeze the hold — TTL suspended (holdFrozenAt set).
      return ok('PAYMENT_PENDING', {
        holdFrozenAt: ctx.holdFrozenAt ?? ctx.now,
      });

    case 'GATEWAY_FINISHED':
      return ok('CONFIRMED', { holdExpiresAt: null, holdFrozenAt: null });

    case 'GATEWAY_PARTIALLY_PAID':
      return reject('GATEWAY_PARTIALLY_PAID is only valid from PAYMENT_PENDING (a quoted payment must exist)');

    case 'GATEWAY_FAILED':
    case 'GATEWAY_EXPIRED':
      return ok('AVAILABLE', { release: 'CANCELLED' });

    case 'TTL_EXPIRED':
      return expireHold(event, ctx);

    case 'CUSTOMER_CANCEL':
      return ok('AVAILABLE', { release: 'CANCELLED' });

    default:
      return reject(`Invalid event '${event}' for state HELD`);
  }
}

function transitionFromPaymentPending(
  event: BookingFsmEvent,
  ctx: BookingFsmContext
): FsmTransitionResult {
  switch (event) {
    case 'GATEWAY_CONFIRMING':
      // Idempotent freeze: keep the ORIGINAL holdFrozenAt (first confirming wins).
      return ok('PAYMENT_PENDING', {
        holdFrozenAt: ctx.holdFrozenAt ?? ctx.now,
      });

    case 'GATEWAY_FINISHED':
      return ok('CONFIRMED', { holdExpiresAt: null, holdFrozenAt: null });

    case 'GATEWAY_PARTIALLY_PAID':
      // UNDERPAID: staff resolution only — NO auto-confirm (contract test table).
      return ok('UNDERPAID', { holdFrozenAt: null, holdExpiresAt: null });

    case 'GATEWAY_FAILED':
    case 'GATEWAY_EXPIRED':
      return ok('AVAILABLE', { release: 'CANCELLED' });

    case 'TTL_EXPIRED':
      return expireHold(event, ctx);

    case 'CUSTOMER_CANCEL':
      return ok('AVAILABLE', { release: 'CANCELLED' });

    default:
      return reject(`Invalid event '${event}' for state PAYMENT_PENDING`);
  }
}

function transitionFromPendingApproval(event: BookingFsmEvent): FsmTransitionResult {
  switch (event) {
    case 'STAFF_APPROVE':
      return ok('CONFIRMED', { holdExpiresAt: null, holdFrozenAt: null });
    case 'STAFF_REJECT':
      return ok('AVAILABLE', { release: 'STAFF_REJECTED' });
    case 'CUSTOMER_CANCEL':
      return ok('AVAILABLE', { release: 'CANCELLED' });
    default:
      return reject(`Invalid event '${event}' for state PENDING_APPROVAL`);
  }
}

function transitionFromUnderpaid(event: BookingFsmEvent): FsmTransitionResult {
  switch (event) {
    case 'STAFF_RESOLVE_CONFIRM':
      // Manual staff confirmation after underpayment resolution.
      return ok('CONFIRMED', { holdExpiresAt: null, holdFrozenAt: null });
    case 'STAFF_RESOLVE_CANCEL':
    case 'CUSTOMER_CANCEL':
      return ok('AVAILABLE', { release: 'CANCELLED' });
    default:
      return reject(`Invalid event '${event}' for state UNDERPAID (staff resolution only)`);
  }
}

/**
 * TTL expiry on HELD|PAYMENT_PENDING honoring the confirming freeze:
 * frozen within ceiling → rejected (TTL suspended); frozen past the 24 h
 * ceiling → hold expires, slot releases, order → FR-432 resolution.
 */
function expireHold(event: 'TTL_EXPIRED', ctx: BookingFsmContext): FsmTransitionResult {
  const verdict = evaluateHoldExpiry({
    status: 'HELD',
    holdExpiresAt: ctx.holdExpiresAt,
    holdFrozenAt: ctx.holdFrozenAt,
    now: ctx.now,
  });

  switch (verdict) {
    case 'FROZEN':
      return reject('TTL_EXPIRED suppressed: hold is frozen on gateway confirming (within 24h ceiling)');
    case 'FREEZE_CEILING_EXCEEDED':
      // Hard ceiling: hold expires, slot releases, order → FR-432 refund resolution.
      return ok('AVAILABLE', { release: 'CANCELLED', orderResolution: 'FR432_REFUND_24H' });
    case 'EXPIRED':
      return ok('AVAILABLE', { release: 'CANCELLED' });
    case 'ACTIVE':
      return reject('TTL_EXPIRED rejected: hold TTL has not elapsed');
    case 'NOT_HOLD':
    default:
      return reject('TTL_EXPIRED requires a hold deadline (holdExpiresAt)');
  }
}
