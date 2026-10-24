/**
 * T023: confirming-freeze — holdFrozenAt on first `confirming`, sweeper/TTL
 * respect, MAX_CONFIRMING_FREEZE (24h) ceiling. TTL-vs-freeze race coverage.
 */
import { evaluateInvoiceExpiryWakeUpCas, runDeadlineSweeperInMemory } from '@/lib/jobs/deadlineSweeper';
import { recordConfirmingFreeze } from '@/lib/payments/fulfillment';
import { prisma } from '@/lib/db/prisma';
import { MAX_CONFIRMING_FREEZE_MS } from '@/lib/kernel/bookingFsm';

jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    $transaction: jest.fn(),
  },
}));

jest.mock('@/lib/telemetry/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), counter: jest.fn() },
}));

const mockedPrisma = prisma as unknown as { $transaction: jest.Mock };

const NOW = new Date('2026-01-15T12:00:00.000Z');

describe('Confirming freeze (T023)', () => {
  describe('recordConfirmingFreeze (service layer, mocked prisma)', () => {
    function txWithReservation(reservation: {
      id: string;
      status: string;
      holdFrozenAt: Date | null;
    } | null) {
      return {
        order: {
          findUnique: jest.fn().mockResolvedValue(
            reservation
              ? { id: 'order-1', reservation }
              : { id: 'order-1', reservation: null }
          ),
        },
        slotReservation: { update: jest.fn().mockResolvedValue({}) },
      };
    }

    it('sets holdFrozenAt on the first confirming callback', async () => {
      const tx = txWithReservation({ id: 'slot-1', status: 'PAYMENT_PENDING', holdFrozenAt: null });
      mockedPrisma.$transaction.mockImplementation(async (fn: (t: unknown) => unknown) => fn(tx));

      const result = await recordConfirmingFreeze('order-1', NOW);

      expect(result).toEqual({ frozen: true, alreadyFrozen: false });
      expect(tx.slotReservation.update).toHaveBeenCalledWith({
        where: { id: 'slot-1' },
        data: { holdFrozenAt: NOW },
      });
    });

    it('is idempotent: the ORIGINAL freeze wins, second confirming never moves it', async () => {
      const original = new Date(NOW.getTime() - 60 * 60 * 1000);
      const tx = txWithReservation({ id: 'slot-1', status: 'PAYMENT_PENDING', holdFrozenAt: original });
      mockedPrisma.$transaction.mockImplementation(async (fn: (t: unknown) => unknown) => fn(tx));

      const result = await recordConfirmingFreeze('order-1', NOW);

      expect(result).toEqual({ frozen: true, alreadyFrozen: true });
      expect(tx.slotReservation.update).not.toHaveBeenCalled();
    });

    it('no-ops for bookings without an active hold (BOOKED/RELEASED)', async () => {
      for (const status of ['BOOKED', 'RELEASED', 'PENDING_APPROVAL']) {
        const tx = txWithReservation({ id: 'slot-1', status, holdFrozenAt: null });
        mockedPrisma.$transaction.mockImplementation(async (fn: (t: unknown) => unknown) => fn(tx));
        const result = await recordConfirmingFreeze('order-1', NOW);
        expect(result).toEqual({ frozen: false, alreadyFrozen: false });
        expect(tx.slotReservation.update).not.toHaveBeenCalled();
      }
    });

    it('no-ops when the order has no reservation (product order)', async () => {
      const tx = txWithReservation(null);
      mockedPrisma.$transaction.mockImplementation(async (fn: (t: unknown) => unknown) => fn(tx));
      const result = await recordConfirmingFreeze('order-1', NOW);
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
