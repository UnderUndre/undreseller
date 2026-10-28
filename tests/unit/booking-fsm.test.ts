/**
 * Exhaustive unit tests for the pure booking FSM (T020, data-model §2.1).
 * Covers: FREE track, PREPAID track, UNDERPAID, confirming freeze, TTL expiry,
 * late-payment FR-444/FR-432 branches, invalid transitions, and the
 * CONFIRMED↔BOOKED / AVAILABLE↔RELEASED name mapping.
 */
import {
  DB_TO_SPEC_BOOKING_STATE,
  MAX_CONFIRMING_FREEZE_MS,
  PREPAID_HOLD_TTL_MS,
  SPEC_TO_DB_RESERVATION_STATUS,
  evaluateHoldExpiry,
  isConfirmingFreezeCeilingExceeded,
  isHoldTtlSweepSuppressed,
  transitionBookingFsm,
  type BookingFsmContext,
} from '@/lib/kernel/bookingFsm';

const NOW = new Date('2026-01-15T12:00:00.000Z');

function ctx(overrides: Partial<BookingFsmContext> = {}): BookingFsmContext {
  return { now: NOW, ...overrides };
}

describe('Booking FSM (T020, data-model §2.1)', () => {
  describe('name mapping (spec ↔ DB, antigravity F1)', () => {
    it('maps spec CONFIRMED to DB BOOKED and spec AVAILABLE to DB RELEASED', () => {
      expect(SPEC_TO_DB_RESERVATION_STATUS.CONFIRMED).toBe('BOOKED');
      expect(SPEC_TO_DB_RESERVATION_STATUS.AVAILABLE).toBe('RELEASED');
      expect(SPEC_TO_DB_RESERVATION_STATUS.PENDING_APPROVAL).toBe('PENDING_APPROVAL');
      expect(SPEC_TO_DB_RESERVATION_STATUS.PAYMENT_PENDING).toBe('PAYMENT_PENDING');
      expect(SPEC_TO_DB_RESERVATION_STATUS.UNDERPAID).toBe('UNDERPAID');
      expect(SPEC_TO_DB_RESERVATION_STATUS.HELD).toBe('HELD');
    });

    it('maps DB BOOKED back to spec CONFIRMED and RELEASED back to AVAILABLE', () => {
      expect(DB_TO_SPEC_BOOKING_STATE.BOOKED).toBe('CONFIRMED');
      expect(DB_TO_SPEC_BOOKING_STATE.RELEASED).toBe('AVAILABLE');
      expect(DB_TO_SPEC_BOOKING_STATE.CANCELLED).toBe('AVAILABLE');
      expect(DB_TO_SPEC_BOOKING_STATE.STAFF_REJECTED).toBe('AVAILABLE');
    });
  });

  describe('FREE track', () => {
    it('AVAILABLE + CREATE_BOOKING (IN_CALL, no approval) auto-confirms', () => {
      const r = transitionBookingFsm(
        'AVAILABLE',
        'CREATE_BOOKING',
        ctx({ track: 'FREE', requiresApproval: false })
      );
      expect(r).toEqual({ ok: true, state: 'CONFIRMED', effects: { holdExpiresAt: null, holdFrozenAt: null } });
    });

    it('AVAILABLE + CREATE_BOOKING (OUT_CALL always approval) → PENDING_APPROVAL with no TTL', () => {
      const r = transitionBookingFsm(
        'AVAILABLE',
        'CREATE_BOOKING',
        ctx({ track: 'FREE', requiresApproval: true })
      );
      expect(r.ok && r.state).toBe('PENDING_APPROVAL');
      expect(r.ok && r.effects.holdExpiresAt).toBeNull();
    });

    it('PENDING_APPROVAL + STAFF_APPROVE → CONFIRMED', () => {
      const r = transitionBookingFsm('PENDING_APPROVAL', 'STAFF_APPROVE', ctx());
      expect(r.ok && r.state).toBe('CONFIRMED');
    });

    it('PENDING_APPROVAL + STAFF_REJECT → AVAILABLE (STAFF_REJECTED release flavor)', () => {
      const r = transitionBookingFsm('PENDING_APPROVAL', 'STAFF_REJECT', ctx());
      expect(r.ok && r.state).toBe('AVAILABLE');
      expect(r.ok && r.effects.release).toBe('STAFF_REJECTED');
    });

    it('PENDING_APPROVAL + CUSTOMER_CANCEL → AVAILABLE (CANCELLED)', () => {
      const r = transitionBookingFsm('PENDING_APPROVAL', 'CUSTOMER_CANCEL', ctx());
      expect(r.ok && r.state).toBe('AVAILABLE');
      expect(r.ok && r.effects.release).toBe('CANCELLED');
    });

    it('PENDING_APPROVAL rejects payment events (free track has no gateway)', () => {
      expect(transitionBookingFsm('PENDING_APPROVAL', 'GATEWAY_FINISHED', ctx()).ok).toBe(false);
      expect(transitionBookingFsm('PENDING_APPROVAL', 'TTL_EXPIRED', ctx()).ok).toBe(false);
    });
  });

  describe('PREPAID track', () => {
    it('AVAILABLE + CREATE_BOOKING (prepaid) → HELD with 15-minute TTL', () => {
      const r = transitionBookingFsm('AVAILABLE', 'CREATE_BOOKING', ctx({ track: 'PREPAID' }));
      expect(r.ok && r.state).toBe('HELD');
      expect(r.ok && r.effects.holdExpiresAt?.getTime()).toBe(NOW.getTime() + PREPAID_HOLD_TTL_MS);
      expect(PREPAID_HOLD_TTL_MS).toBe(15 * 60 * 1000);
    });

    it('HELD + GATEWAY_WAITING → PAYMENT_PENDING', () => {
      const r = transitionBookingFsm('HELD', 'GATEWAY_WAITING', ctx());
      expect(r.ok && r.state).toBe('PAYMENT_PENDING');
    });

    it('PAYMENT_PENDING + GATEWAY_FINISHED → CONFIRMED (hold TTL cleared)', () => {
      const r = transitionBookingFsm('PAYMENT_PENDING', 'GATEWAY_FINISHED', ctx());
      expect(r.ok && r.state).toBe('CONFIRMED');
      expect(r.ok && r.effects.holdExpiresAt).toBeNull();
    });

    it('HELD + GATEWAY_FAILED / GATEWAY_EXPIRED → AVAILABLE (slot released)', () => {
      for (const ev of ['GATEWAY_FAILED', 'GATEWAY_EXPIRED'] as const) {
        const r = transitionBookingFsm('HELD', ev, ctx());
        expect(r.ok && r.state).toBe('AVAILABLE');
        expect(r.ok && r.effects.release).toBe('CANCELLED');
      }
    });

    it('PAYMENT_PENDING + GATEWAY_FAILED → AVAILABLE', () => {
      const r = transitionBookingFsm('PAYMENT_PENDING', 'GATEWAY_FAILED', ctx());
      expect(r.ok && r.state).toBe('AVAILABLE');
    });

    it('HELD + CUSTOMER_CANCEL and PAYMENT_PENDING + CUSTOMER_CANCEL → AVAILABLE', () => {
      expect(transitionBookingFsm('HELD', 'CUSTOMER_CANCEL', ctx()).ok && true).toBe(true);
      const r = transitionBookingFsm('PAYMENT_PENDING', 'CUSTOMER_CANCEL', ctx());
      expect(r.ok && r.state).toBe('AVAILABLE');
      expect(r.ok && r.effects.release).toBe('CANCELLED');
    });
  });

  describe('confirming freeze (T023 semantics, pure core)', () => {
    it('PAYMENT_PENDING + GATEWAY_CONFIRMING sets holdFrozenAt and keeps state', () => {
      const r = transitionBookingFsm('PAYMENT_PENDING', 'GATEWAY_CONFIRMING', ctx());
      expect(r.ok && r.state).toBe('PAYMENT_PENDING');
      expect(r.ok && r.effects.holdFrozenAt?.getTime()).toBe(NOW.getTime());
    });

    it('HELD + GATEWAY_CONFIRMING also freezes (invoice created then confirming)', () => {
      const r = transitionBookingFsm('HELD', 'GATEWAY_CONFIRMING', ctx());
      expect(r.ok && r.state).toBe('PAYMENT_PENDING');
      expect(r.ok && r.effects.holdFrozenAt).toBeTruthy();
    });

    it('freeze is idempotent: the ORIGINAL holdFrozenAt wins on repeated confirming', () => {
      const first = new Date(NOW.getTime() - 60 * 60 * 1000);
      const r = transitionBookingFsm(
        'PAYMENT_PENDING',
        'GATEWAY_CONFIRMING',
        ctx({ holdFrozenAt: first })
      );
      expect(r.ok && r.effects.holdFrozenAt?.getTime()).toBe(first.getTime());
    });

    it('TTL_EXPIRED is suppressed while frozen within the 24h ceiling', () => {
      const frozenAt = new Date(NOW.getTime() - 23 * 60 * 60 * 1000);
      const r = transitionBookingFsm(
        'PAYMENT_PENDING',
        'TTL_EXPIRED',
        ctx({
          holdFrozenAt: frozenAt,
          holdExpiresAt: new Date(NOW.getTime() - 10 * 60 * 1000), // TTL long past
        })
      );
      expect(r.ok).toBe(false);
      expect(!r.ok && r.reason).toMatch(/frozen/i);
    });

    it('freeze past MAX_CONFIRMING_FREEZE (24h): hold expires, slot releases, FR-432 refund resolution', () => {
      const frozenAt = new Date(NOW.getTime() - MAX_CONFIRMING_FREEZE_MS - 1000);
      const r = transitionBookingFsm(
        'PAYMENT_PENDING',
        'TTL_EXPIRED',
        ctx({ holdFrozenAt: frozenAt })
      );
      expect(r.ok && r.state).toBe('AVAILABLE');
      expect(r.ok && r.effects.release).toBe('CANCELLED');
      expect(r.ok && r.effects.orderResolution).toBe('FR432_REFUND_24H');
    });

    it('TTL_EXPIRED with no freeze and elapsed TTL → AVAILABLE', () => {
      const r = transitionBookingFsm(
        'HELD',
        'TTL_EXPIRED',
        ctx({ holdExpiresAt: new Date(NOW.getTime() - 1) })
      );
      expect(r.ok && r.state).toBe('AVAILABLE');
      expect(r.ok && r.effects.release).toBe('CANCELLED');
    });

    it('TTL_EXPIRED before TTL elapse is rejected; missing deadline is rejected', () => {
      const notYet = transitionBookingFsm(
        'HELD',
        'TTL_EXPIRED',
        ctx({ holdExpiresAt: new Date(NOW.getTime() + 60 * 1000) })
      );
      expect(notYet.ok).toBe(false);
      expect(transitionBookingFsm('HELD', 'TTL_EXPIRED', ctx()).ok).toBe(false);
    });

    it('evaluateHoldExpiry verdicts across the matrix', () => {
      const frozenAt = new Date(NOW.getTime() - 1000);
      const expiredAt = new Date(NOW.getTime() - 1000);
      expect(evaluateHoldExpiry({ status: 'PENDING_APPROVAL', now: NOW })).toBe('NOT_HOLD');
      expect(
        evaluateHoldExpiry({
          status: 'HELD',
          holdExpiresAt: new Date(NOW.getTime() + 60000),
          now: NOW,
        })
      ).toBe('ACTIVE');
      expect(evaluateHoldExpiry({ status: 'HELD', holdExpiresAt: expiredAt, now: NOW })).toBe('EXPIRED');
      expect(evaluateHoldExpiry({ status: 'HELD', holdFrozenAt: frozenAt, now: NOW })).toBe('FROZEN');
      expect(
        evaluateHoldExpiry({
          status: 'PAYMENT_PENDING',
          holdFrozenAt: new Date(NOW.getTime() - MAX_CONFIRMING_FREEZE_MS - 1),
          now: NOW,
        })
      ).toBe('FREEZE_CEILING_EXCEEDED');
      expect(evaluateHoldExpiry({ status: 'HELD', now: NOW })).toBe('ACTIVE'); // legacy null-TTL hold
    });

    it('isHoldTtlSweepSuppressed / isConfirmingFreezeCeilingExceeded boundary at exactly 24h', () => {
      const edge = new Date(NOW.getTime() - MAX_CONFIRMING_FREEZE_MS);
      expect(isHoldTtlSweepSuppressed({ holdFrozenAt: edge, now: NOW })).toBe(false);
      expect(isConfirmingFreezeCeilingExceeded({ holdFrozenAt: edge, now: NOW })).toBe(true);
      expect(
        isHoldTtlSweepSuppressed({ holdFrozenAt: new Date(NOW.getTime() - 1), now: NOW })
      ).toBe(true);
      expect(isHoldTtlSweepSuppressed({ holdFrozenAt: null, now: NOW })).toBe(false);
    });
  });

  describe('UNDERPAID flow (no auto-confirm)', () => {
    it('PAYMENT_PENDING + GATEWAY_PARTIALLY_PAID → UNDERPAID (staff resolution only)', () => {
      const r = transitionBookingFsm('PAYMENT_PENDING', 'GATEWAY_PARTIALLY_PAID', ctx());
      expect(r.ok && r.state).toBe('UNDERPAID');
      expect(r.ok && r.effects.orderResolution).toBeUndefined(); // no auto-confirm, no auto-resolve
    });

    it('GATEWAY_PARTIALLY_PAID from HELD is rejected (a quoted payment must exist)', () => {
      expect(transitionBookingFsm('HELD', 'GATEWAY_PARTIALLY_PAID', ctx()).ok).toBe(false);
    });

    it('UNDERPAID + GATEWAY_FINISHED is rejected — no auto-confirm on underpaid', () => {
      expect(transitionBookingFsm('UNDERPAID', 'GATEWAY_FINISHED', ctx()).ok).toBe(false);
    });

    it('UNDERPAID + STAFF_RESOLVE_CONFIRM → CONFIRMED; STAFF_RESOLVE_CANCEL → AVAILABLE', () => {
      expect(transitionBookingFsm('UNDERPAID', 'STAFF_RESOLVE_CONFIRM', ctx()).ok)
        .toBe(true);
      const cancel = transitionBookingFsm('UNDERPAID', 'STAFF_RESOLVE_CANCEL', ctx());
      expect(cancel.ok && cancel.state).toBe('AVAILABLE');
      expect(cancel.ok && cancel.effects.release).toBe('CANCELLED');
    });

    it('UNDERPAID rejects customer-independent events', () => {
      expect(transitionBookingFsm('UNDERPAID', 'STAFF_APPROVE', ctx()).ok).toBe(false);
      expect(transitionBookingFsm('UNDERPAID', 'TTL_EXPIRED', ctx()).ok).toBe(false);
    });
  });

  describe('late payment on released slot (FR-444 / FR-432)', () => {
    it('finished after slot released and slot FREE → atomic re-confirm, no refund path', () => {
      const r = transitionBookingFsm(
        'AVAILABLE',
        'GATEWAY_FINISHED',
        ctx({ slotReleased: true })
      );
      expect(r.ok && r.state).toBe('CONFIRMED');
      expect(r.ok && r.effects.lateReconfirm).toBe(true);
      expect(r.ok && r.effects.orderResolution).toBeUndefined();
    });

    it('finished after slot RE-BOOKED → stays AVAILABLE with FR-432 refund resolution', () => {
      const r = transitionBookingFsm(
        'AVAILABLE',
        'GATEWAY_FINISHED',
        ctx({ slotRebooked: true })
      );
      expect(r.ok && r.state).toBe('AVAILABLE');
      expect(r.ok && r.effects.orderResolution).toBe('FR432_REFUND_24H');
      expect(r.ok && r.effects.lateReconfirm).toBeUndefined();
    });

    it('GATEWAY_FINISHED on AVAILABLE without disambiguation context is rejected', () => {
      expect(transitionBookingFsm('AVAILABLE', 'GATEWAY_FINISHED', ctx()).ok).toBe(false);
    });
  });

  describe('invalid transitions', () => {
    it('CONFIRMED is terminal: every event is rejected (no double-confirm)', () => {
      for (const ev of [
        'CREATE_BOOKING',
        'GATEWAY_FINISHED',
        'STAFF_APPROVE',
        'TTL_EXPIRED',
        'CUSTOMER_CANCEL',
      ] as const) {
        expect(transitionBookingFsm('CONFIRMED', ev, ctx()).ok).toBe(false);
      }
    });

    it('AVAILABLE rejects booking-independent events', () => {
      expect(transitionBookingFsm('AVAILABLE', 'STAFF_APPROVE', ctx()).ok).toBe(false);
      expect(transitionBookingFsm('AVAILABLE', 'TTL_EXPIRED', ctx()).ok).toBe(false);
      expect(transitionBookingFsm('AVAILABLE', 'GATEWAY_WAITING', ctx()).ok).toBe(false);
    });

    it('HELD rejects staff-approval events (prepaid track)', () => {
      expect(transitionBookingFsm('HELD', 'STAFF_APPROVE', ctx()).ok).toBe(false);
      expect(transitionBookingFsm('HELD', 'STAFF_REJECT', ctx()).ok).toBe(false);
    });
  });
});
