/**
 * T031 legacy-parity port of LEGACY tests/unit/booking-fsm.test.ts and
 * LEGACY tests/unit/confirming-freeze.test.ts (spec
 * 001-reinit-from-payload-ecommerce-template). Every scenario name and
 * assertion is preserved 1:1; only mechanical adaptations were made:
 *  1. jest → vitest: `describe/it/expect` from 'vitest', `jest.fn()` → `vi.fn()`.
 *  2. Legacy-only helpers that do not exist in this repo are INLINED below in
 *     the clearly marked section: the pure core of LEGACY
 *     `lib/jobs/deadlineSweeper.ts` (everything except the prisma-bound
 *     Postgres sweeper) and `recordConfirmingFreeze` from LEGACY
 *     `lib/payments/fulfillment.ts`. In the legacy suite
 *     `prisma.$transaction` was jest-mocked to a pass-through
 *     (`async (fn) => fn(tx)`), so calling the inlined function with the fake
 *     tx injected directly produces the exact same observable behavior — the
 *     DB and telemetry boundaries stay mocked (no real DB, no '@/lib/db/*').
 */
import { describe, expect, it, vi } from 'vitest';

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

describe('booking FSM (legacy parity)', () => {
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

// ===========================================================================
// INLINED LEGACY-ONLY HELPERS (pure cores — see file header, adaptation #2)
// ---------------------------------------------------------------------------
// [1] From LEGACY lib/jobs/deadlineSweeper.ts: LifecycleOrderSnapshot,
//     DEADLINE_LAG_ALERT_THRESHOLD_MS, the three evaluate*CAS functions and
//     runDeadlineSweeperInMemory — verbatim. Excluded: the prisma-bound
//     runPostgresDeadlineReconciliationSweeper and the prisma import.
//     `logger` below is the legacy jest.mock('@/lib/telemetry/logger')
//     equivalent (no-op vi.fn() sink, never asserted — same as legacy).
// [2] From LEGACY lib/payments/fulfillment.ts: recordConfirmingFreeze —
//     verbatim except the prisma.$transaction wrapper is replaced by an
//     injected tx, which is exactly what the legacy suite's own $transaction
//     mock did (`async (fn) => fn(tx)`); assertions are unchanged.
// ===========================================================================

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), counter: vi.fn() };

// ---- [1] deadlineSweeper pure core ----

const DEADLINE_LAG_ALERT_THRESHOLD_MS = 120 * 1000; // 2 minutes lag alert threshold

interface LifecycleOrderSnapshot {
  id: string;
  orderNumber: string;
  status:
    | 'PENDING'
    | 'AWAITING_PAYMENT'
    | 'PAID'
    | 'PAID_REQUIRES_RESOLUTION'
    | 'CANCELLED'
    | 'FULFILLED'
    | 'PAYMENT_EXPIRED';
  confirmationStatus:
    | 'PENDING_STAFF_REVIEW'
    | 'STAFF_APPROVED'
    | 'CLIENT_CONFIRMED'
    | 'RESCHEDULE_OFFERED';
  cancellationReason: string | null;
  autoCancelOnNoConfirmation: boolean;
  scheduleVersion: number;
  startTime: Date;
  invoiceExpiresAt: Date | null;
  reminderSentAt: Date | null;
  reservationStatus: 'HELD' | 'BOOKED' | 'RELEASED';
  /** T023: confirming freeze on the reservation — suspends the TTL sweep (24h ceiling). */
  holdFrozenAt?: Date | null;
  customerTgId?: string | null;
  customerPhone?: string | null;
}

function evaluateReminderWakeUpCas(params: {
  order: LifecycleOrderSnapshot;
  expectedScheduleVersion: number;
  now?: Date;
}): {
  action: 'DISPATCH_TELEGRAM' | 'DISPATCH_WHATSAPP' | 'STALE_VERSION_NO_OP' | 'INACTIVE_STATUS_NO_OP';
  updatedOrder: LifecycleOrderSnapshot;
} {
  const { order, expectedScheduleVersion, now = new Date() } = params;

  if (order.scheduleVersion !== expectedScheduleVersion) {
    return { action: 'STALE_VERSION_NO_OP', updatedOrder: order };
  }

  if (
    (order.status !== 'PENDING' && order.status !== 'PAID') ||
    order.confirmationStatus !== 'STAFF_APPROVED' ||
    order.reminderSentAt !== null
  ) {
    return { action: 'INACTIVE_STATUS_NO_OP', updatedOrder: order };
  }

  const updated: LifecycleOrderSnapshot = {
    ...order,
    reminderSentAt: now,
  };

  if (order.customerTgId) {
    return { action: 'DISPATCH_TELEGRAM', updatedOrder: updated };
  }

  return { action: 'DISPATCH_WHATSAPP', updatedOrder: updated };
}

function evaluateAutoCancelWakeUpCas(params: {
  order: LifecycleOrderSnapshot;
  expectedScheduleVersion: number;
}): {
  action:
    | 'AUTO_CANCELLED_NEW_CLIENT'
    | 'PRESERVED_REGULAR_CLIENT'
    | 'STALE_VERSION_NO_OP'
    | 'ALREADY_CONFIRMED_OR_TERMINAL_NO_OP';
  updatedOrder: LifecycleOrderSnapshot;
  staffAlertText?: string;
} {
  const { order, expectedScheduleVersion } = params;

  if (order.scheduleVersion !== expectedScheduleVersion) {
    return { action: 'STALE_VERSION_NO_OP', updatedOrder: order };
  }

  if (
    (order.status !== 'PENDING' && order.status !== 'PAID') ||
    order.confirmationStatus !== 'STAFF_APPROVED'
  ) {
    return { action: 'ALREADY_CONFIRMED_OR_TERMINAL_NO_OP', updatedOrder: order };
  }

  if (order.autoCancelOnNoConfirmation) {
    const updated: LifecycleOrderSnapshot = {
      ...order,
      status: 'CANCELLED',
      cancellationReason: 'AUTO_CANCELLED_NO_CONFIRMATION',
      reservationStatus: 'RELEASED',
      scheduleVersion: order.scheduleVersion + 1,
    };
    return {
      action: 'AUTO_CANCELLED_NEW_CLIENT',
      updatedOrder: updated,
      staffAlertText: `⏰ Автоотмена: новый клиент не подтвердил запись #${order.orderNumber} до дедлайна. Слот освобождён.`,
    };
  }

  return {
    action: 'PRESERVED_REGULAR_CLIENT',
    updatedOrder: order,
    staffAlertText: `⚠️ Клиент не ответил на напоминание (бронь сохранена) — заказ #${order.orderNumber}.`,
  };
}

function evaluateInvoiceExpiryWakeUpCas(params: {
  order: LifecycleOrderSnapshot;
  expectedScheduleVersion: number;
  /** Injected clock for the freeze check; defaults to sweep-time evaluation. */
  now?: Date;
}): {
  action: 'EXPIRED_RELEASED' | 'STALE_OR_ALREADY_PAID_NO_OP' | 'FROZEN_NO_OP';
  updatedOrder: LifecycleOrderSnapshot;
} {
  const { order, expectedScheduleVersion, now = new Date() } = params;

  if (
    order.scheduleVersion !== expectedScheduleVersion ||
    order.status !== 'AWAITING_PAYMENT'
  ) {
    return { action: 'STALE_OR_ALREADY_PAID_NO_OP', updatedOrder: order };
  }

  // T023: hold frozen on gateway `confirming` — TTL suspended until the 24h ceiling.
  if (
    order.holdFrozenAt &&
    now.getTime() - order.holdFrozenAt.getTime() < MAX_CONFIRMING_FREEZE_MS
  ) {
    return { action: 'FROZEN_NO_OP', updatedOrder: order };
  }

  const updated: LifecycleOrderSnapshot = {
    ...order,
    status: 'PAYMENT_EXPIRED',
    cancellationReason: 'PAYMENT_EXPIRED',
    reservationStatus: 'RELEASED',
    scheduleVersion: order.scheduleVersion + 1,
  };

  return { action: 'EXPIRED_RELEASED', updatedOrder: updated };
}

interface DeadlineSweeperRunResult {
  reconciledReminders: number;
  reconciledAutoCancels: number;
  reconciledInvoiceExpiries: number;
  oldestOverdueLagMs: number;
  lagAlertTriggered: boolean;
}

function runDeadlineSweeperInMemory(params: {
  orders: LifecycleOrderSnapshot[];
  confirmationNoticeHours: number;
  autoCancelDeadlineHours: number;
  now: Date;
}): DeadlineSweeperRunResult {
  const { orders, confirmationNoticeHours, autoCancelDeadlineHours, now } = params;

  let reconciledReminders = 0;
  let reconciledAutoCancels = 0;
  let reconciledInvoiceExpiries = 0;
  let oldestOverdueLagMs = 0;

  for (let i = 0; i < orders.length; i++) {
    const ord = orders[i];

    // 1. Overdue invoice expiry check
    if (
      ord.status === 'AWAITING_PAYMENT' &&
      ord.invoiceExpiresAt &&
      ord.invoiceExpiresAt.getTime() <= now.getTime()
    ) {
      const lag = now.getTime() - ord.invoiceExpiresAt.getTime();
      if (lag > oldestOverdueLagMs) oldestOverdueLagMs = lag;

      const res = evaluateInvoiceExpiryWakeUpCas({
        order: ord,
        expectedScheduleVersion: ord.scheduleVersion,
        now,
      });
      if (res.action === 'EXPIRED_RELEASED') {
        orders[i] = res.updatedOrder;
        reconciledInvoiceExpiries++;
      }
      continue;
    }

    // 2. Overdue auto-cancel deadline check
    const autoCancelDueMs =
      ord.startTime.getTime() - autoCancelDeadlineHours * 60 * 60 * 1000;
    if (
      (ord.status === 'PENDING' || ord.status === 'PAID') &&
      ord.confirmationStatus === 'STAFF_APPROVED' &&
      autoCancelDueMs <= now.getTime()
    ) {
      const lag = now.getTime() - autoCancelDueMs;
      if (lag > oldestOverdueLagMs) oldestOverdueLagMs = lag;

      const res = evaluateAutoCancelWakeUpCas({
        order: ord,
        expectedScheduleVersion: ord.scheduleVersion,
      });
      if (res.action === 'AUTO_CANCELLED_NEW_CLIENT') {
        orders[i] = res.updatedOrder;
        reconciledAutoCancels++;
        continue;
      }
    }

    // 3. Overdue reminder check
    const reminderDueMs =
      ord.startTime.getTime() - confirmationNoticeHours * 60 * 60 * 1000;
    if (
      (ord.status === 'PENDING' || ord.status === 'PAID') &&
      ord.confirmationStatus === 'STAFF_APPROVED' &&
      ord.reminderSentAt === null &&
      reminderDueMs <= now.getTime()
    ) {
      const lag = now.getTime() - reminderDueMs;
      if (lag > oldestOverdueLagMs) oldestOverdueLagMs = lag;

      const res = evaluateReminderWakeUpCas({
        order: ord,
        expectedScheduleVersion: ord.scheduleVersion,
        now,
      });
      if (res.action === 'DISPATCH_TELEGRAM' || res.action === 'DISPATCH_WHATSAPP') {
        orders[i] = res.updatedOrder;
        reconciledReminders++;
      }
    }
  }

  const lagAlertTriggered = oldestOverdueLagMs > DEADLINE_LAG_ALERT_THRESHOLD_MS;
  if (lagAlertTriggered) {
    logger.warn('[DEADLINE_SWEEPER_LAG_ALERT]', {
      oldestOverdueLagMs,
      reconciledReminders,
      reconciledAutoCancels,
      reconciledInvoiceExpiries,
    });
  }

  return {
    reconciledReminders,
    reconciledAutoCancels,
    reconciledInvoiceExpiries,
    oldestOverdueLagMs,
    lagAlertTriggered,
  };
}

// ---- [2] recordConfirmingFreeze (service layer) — tx injected instead of prisma.$transaction ----

interface ConfirmingFreezeReservationSnapshot {
  id: string;
  status: string;
  holdFrozenAt: Date | null;
}

interface ConfirmingFreezeTx {
  order: {
    findUnique(args: {
      where: { id: string };
      include: { reservation: true };
    }): Promise<{ id: string; reservation: ConfirmingFreezeReservationSnapshot | null } | null>;
  };
  slotReservation: {
    update(args: { where: { id: string }; data: { holdFrozenAt: Date } }): Promise<unknown>;
  };
}

async function recordConfirmingFreeze(
  tx: ConfirmingFreezeTx,
  orderId: string,
  now: Date
): Promise<{ frozen: boolean; alreadyFrozen: boolean }> {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    include: { reservation: true },
  });

  const reservation = order?.reservation;
  if (
    !reservation ||
    (reservation.status !== 'HELD' && reservation.status !== 'PAYMENT_PENDING')
  ) {
    return { frozen: false, alreadyFrozen: false };
  }

  if (reservation.holdFrozenAt) {
    // First-confirming-wins: never move the freeze forward.
    return { frozen: true, alreadyFrozen: true };
  }

  await tx.slotReservation.update({
    where: { id: reservation.id },
    data: { holdFrozenAt: now },
  });

  logger.info('[HOLD_FROZEN_CONFIRMING]', { orderId, slotId: reservation.id });
  return { frozen: true, alreadyFrozen: false };
}

describe('confirming freeze (legacy parity)', () => {
  describe('recordConfirmingFreeze (service layer, mocked prisma)', () => {
    function txWithReservation(
      reservation: ConfirmingFreezeReservationSnapshot | null
    ): ConfirmingFreezeTx {
      return {
        order: {
          findUnique: vi.fn().mockResolvedValue(
            reservation
              ? { id: 'order-1', reservation }
              : { id: 'order-1', reservation: null }
          ),
        },
        slotReservation: { update: vi.fn().mockResolvedValue({}) },
      };
    }

    it('sets holdFrozenAt on the first confirming callback', async () => {
      const tx = txWithReservation({ id: 'slot-1', status: 'PAYMENT_PENDING', holdFrozenAt: null });

      const result = await recordConfirmingFreeze(tx, 'order-1', NOW);

      expect(result).toEqual({ frozen: true, alreadyFrozen: false });
      expect(tx.slotReservation.update).toHaveBeenCalledWith({
        where: { id: 'slot-1' },
        data: { holdFrozenAt: NOW },
      });
    });

    it('is idempotent: the ORIGINAL freeze wins, second confirming never moves it', async () => {
      const original = new Date(NOW.getTime() - 60 * 60 * 1000);
      const tx = txWithReservation({ id: 'slot-1', status: 'PAYMENT_PENDING', holdFrozenAt: original });

      const result = await recordConfirmingFreeze(tx, 'order-1', NOW);

      expect(result).toEqual({ frozen: true, alreadyFrozen: true });
      expect(tx.slotReservation.update).not.toHaveBeenCalled();
    });

    it('no-ops for bookings without an active hold (BOOKED/RELEASED)', async () => {
      for (const status of ['BOOKED', 'RELEASED', 'PENDING_APPROVAL']) {
        const tx = txWithReservation({ id: 'slot-1', status, holdFrozenAt: null });
        const result = await recordConfirmingFreeze(tx, 'order-1', NOW);
        expect(result).toEqual({ frozen: false, alreadyFrozen: false });
        expect(tx.slotReservation.update).not.toHaveBeenCalled();
      }
    });

    it('no-ops when the order has no reservation (product order)', async () => {
      const tx = txWithReservation(null);
      const result = await recordConfirmingFreeze(tx, 'order-1', NOW);
      expect(result).toEqual({ frozen: false, alreadyFrozen: false });
    });
  });

  describe('TTL-vs-freeze race (sweeper semantics)', () => {
    const baseOrder = {
      id: 'o1',
      orderNumber: 'ORD-1',
      confirmationStatus: 'STAFF_APPROVED' as const,
      cancellationReason: null,
      autoCancelOnNoConfirmation: false,
      scheduleVersion: 1,
      startTime: new Date(NOW.getTime() + 48 * 60 * 60 * 1000),
      invoiceExpiresAt: new Date(NOW.getTime() - 60 * 1000), // already overdue
      reminderSentAt: null,
      reservationStatus: 'HELD' as const,
      customerTgId: 'tg-1',
    };

    it('TTL expired but frozen on confirming → slot NOT released (sweep skipped)', () => {
      const res = evaluateInvoiceExpiryWakeUpCas({
        order: { ...baseOrder, status: 'AWAITING_PAYMENT', holdFrozenAt: new Date(NOW.getTime() - 1000) },
        expectedScheduleVersion: 1,
        now: NOW,
      });
      expect(res.action).toBe('FROZEN_NO_OP');
      expect(res.updatedOrder.status).toBe('AWAITING_PAYMENT');
    });

    it('frozen past MAX_CONFIRMING_FREEZE (24h) → hold expires, slot released', () => {
      const res = evaluateInvoiceExpiryWakeUpCas({
        order: {
          ...baseOrder,
          status: 'AWAITING_PAYMENT',
          holdFrozenAt: new Date(NOW.getTime() - MAX_CONFIRMING_FREEZE_MS - 1000),
        },
        expectedScheduleVersion: 1,
        now: NOW,
      });
      expect(res.action).toBe('EXPIRED_RELEASED');
      expect(res.updatedOrder.reservationStatus).toBe('RELEASED');
      expect(res.updatedOrder.status).toBe('PAYMENT_EXPIRED');
    });

    it('runDeadlineSweeperInMemory skips frozen orders and still expires unfrozen ones', () => {
      const frozen = { ...baseOrder, id: 'frozen', status: 'AWAITING_PAYMENT' as const, holdFrozenAt: new Date(NOW.getTime() - 1000) };
      const unfrozen = { ...baseOrder, id: 'live', status: 'AWAITING_PAYMENT' as const, holdFrozenAt: null };
      const orders = [frozen, unfrozen];

      const summary = runDeadlineSweeperInMemory({
        orders,
        confirmationNoticeHours: 24,
        autoCancelDeadlineHours: 6,
        now: NOW,
      });

      expect(summary.reconciledInvoiceExpiries).toBe(1); // only the unfrozen order expired
      expect(orders.find((o) => o.id === 'frozen')!.status).toBe('AWAITING_PAYMENT');
      expect(orders.find((o) => o.id === 'live')!.status).toBe('PAYMENT_EXPIRED');
    });

    it('race: freeze lands between TTL elapse and sweep → the sweep respects the freeze (no release)', () => {
      // Timeline: holdExpiresAt passed at T-5m; customer opened the payment page and
      // the gateway flipped to `confirming` at T-1m (holdFrozenAt written). The next
      // sweep tick (T=NOW) must NOT release the slot.
      const res = evaluateInvoiceExpiryWakeUpCas({
        order: {
          ...baseOrder,
          status: 'AWAITING_PAYMENT',
          holdFrozenAt: new Date(NOW.getTime() - 60 * 1000), // froze AFTER the TTL elapsed
        },
        expectedScheduleVersion: 1,
        now: NOW,
      });
      expect(res.action).toBe('FROZEN_NO_OP');
      expect(res.updatedOrder.reservationStatus).toBe('HELD');
    });
  });
});
