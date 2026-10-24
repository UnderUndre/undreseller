/**
 * T028 (FR-430): refund-on-cancellation policy.
 *  - inside window → RefundOperation request recorded (24h SLA) + notifications
 *  - outside window → deposit forfeiture per policy
 *  - prepaid-only: PAY_ON_SITE → not applicable
 *  - cancelBooking wiring (fsmCutover flag) records the refund request
 * Prisma / telegram / delivery log mocked — no live DB.
 */
import { createHash } from 'node:crypto';
import { prisma } from '@/lib/db/prisma';
import { bot } from '@/lib/bot/telegramBot';
import { logDeliveryAttempt } from '@/lib/notifications/deliveryLog';
import {
  evaluateRefundOnCancellation,
  applyRefundPolicyOnCancellation,
  REFUND_REQUEST_SLA_HOURS,
} from '@/lib/payments/refundPolicy';
import { cancelBooking } from '@/lib/kernel/bookingService';
import { getReleaseReadinessFlags } from '@/lib/config/integrationProfile';

jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    $transaction: jest.fn(),
    slotReservation: { findFirst: jest.fn(), update: jest.fn() },
    order: { findUnique: jest.fn(), update: jest.fn() },
    shopSettings: { findUnique: jest.fn() },
    refundOperation: { findUnique: jest.fn(), create: jest.fn() },
  },
}));

jest.mock('@/lib/booking/advisoryLock', () => ({
  acquireResourceSlotLock: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/lib/bot/telegramBot', () => ({
  bot: { api: { sendMessage: jest.fn().mockResolvedValue(true) } },
  sendWithRetry: jest.fn((fn) => fn()),
}));

jest.mock('@/lib/notifications/deliveryLog', () => ({
  logDeliveryAttempt: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/lib/security/staffAuth', () => ({
  emitAuditEvent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/lib/telemetry/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), counter: jest.fn() },
}));

jest.mock('@/lib/config/integrationProfile', () => ({
  getReleaseReadinessFlags: jest.fn(),
}));

const mockedPrisma = prisma as unknown as {
  $transaction: jest.Mock;
  slotReservation: { findFirst: jest.Mock; update: jest.Mock };
  order: { findUnique: jest.Mock; update: jest.Mock };
  shopSettings: { findUnique: jest.Mock };
  refundOperation: { findUnique: jest.Mock; create: jest.Mock };
};

const mockedFlags = getReleaseReadinessFlags as jest.Mock;
const mockedSend = bot.api.sendMessage as unknown as jest.Mock;

const NOW = new Date('2026-06-01T12:00:00.000Z');
const APPOINTMENT_START = new Date('2026-06-03T12:00:00.000Z'); // 48h out
const CANCEL_TOKEN = 'tok-cancellation-1';
const CANCEL_TOKEN_HASH = createHash('sha256').update(CANCEL_TOKEN).digest('hex');

function txReservation(over: Record<string, unknown> = {}) {
  return {
    id: 'res-1',
    orderId: 'order-1',
    resourceId: 'res-src-1',
    status: 'BOOKED',
    startTime: APPOINTMENT_START,
    appointmentStartTime: APPOINTMENT_START,
    cancellationTokenHash: CANCEL_TOKEN_HASH,
    item: { cancellationCutoffHours: 24 },
    order: {
      id: 'order-1',
      orderNumber: 'ORD-42',
      customerTgId: 'tg-cust-1',
      status: 'PAID',
      paymentMethod: 'CRYPTO_GATEWAY',
      paymentRef: 'np-777',
      totalMinor: 10000,
      currency: 'USD',
      refundStatus: 'NONE',
      ...over,
    },
    ...over,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedFlags.mockReturnValue({ fsmCutover: true });
  mockedPrisma.shopSettings.findUnique.mockResolvedValue({ staffDestinationChatId: 'chat-staff' });
  mockedPrisma.refundOperation.findUnique.mockResolvedValue(null);
  mockedPrisma.refundOperation.create.mockResolvedValue({});
  mockedPrisma.slotReservation.update.mockResolvedValue({});
  mockedPrisma.order.update.mockResolvedValue({});
});

describe('evaluateRefundOnCancellation (pure policy)', () => {
  it('inside the refund window → refundable, RefundOperation request with 24h SLA', () => {
    const verdict = evaluateRefundOnCancellation(
      { paymentMethod: 'CRYPTO_GATEWAY', paid: true },
      { cancellationCutoffHours: 24 },
      NOW,
      APPOINTMENT_START
    );
    expect(verdict).toMatchObject({
      applicable: true,
      refundable: true,
      forfeitDeposit: false,
      refundRequest: { slaHours: REFUND_REQUEST_SLA_HOURS },
      reason: 'REFUND_WINDOW_OPEN',
    });
    expect(REFUND_REQUEST_SLA_HOURS).toBe(24);
  });

  it('window boundary: cancelling exactly at the cutoff deadline is still refundable', () => {
    const cutoff = new Date(APPOINTMENT_START.getTime() - 24 * 60 * 60 * 1000);
    const verdict = evaluateRefundOnCancellation(
      { paymentMethod: 'TELEGRAM_STARS', paid: true },
      { cancellationCutoffHours: 24 },
      cutoff,
      APPOINTMENT_START
    );
    expect(verdict.refundable).toBe(true);
  });

  it('outside the window → deposit forfeiture per policy, no refund request', () => {
    const late = new Date(APPOINTMENT_START.getTime() - 23 * 60 * 60 * 1000); // < 24h before start
    const verdict = evaluateRefundOnCancellation(
      { paymentMethod: 'CRYPTO_GATEWAY', paid: true },
      { cancellationCutoffHours: 24 },
      late,
      APPOINTMENT_START
    );
    expect(verdict).toMatchObject({
      applicable: true,
      refundable: false,
      forfeitDeposit: true,
      refundRequest: null,
      reason: 'REFUND_WINDOW_CLOSED',
    });
  });

  it('forfeiture can be disabled by policy (forfeitOutsideWindow: false)', () => {
    const late = new Date(APPOINTMENT_START.getTime() - 1000);
    const verdict = evaluateRefundOnCancellation(
      { paymentMethod: 'CRYPTO_GATEWAY', paid: true },
      { cancellationCutoffHours: 24, forfeitOutsideWindow: false },
      late,
      APPOINTMENT_START
    );
    expect(verdict.forfeitDeposit).toBe(false);
    expect(verdict.refundRequest).toBeNull();
  });

  it('prepaid-only: PAY_ON_SITE / unpaid orders are not applicable', () => {
    for (const order of [
      { paymentMethod: 'PAY_ON_SITE', paid: false },
      { paymentMethod: null, paid: false },
    ]) {
      const verdict = evaluateRefundOnCancellation(order, { cancellationCutoffHours: 24 }, NOW, APPOINTMENT_START);
      expect(verdict).toMatchObject({
        applicable: false,
        refundable: false,
        forfeitDeposit: false,
        refundRequest: null,
        reason: 'NOT_PREPAID',
      });
    }
  });
});

describe('applyRefundPolicyOnCancellation (service, mocked prisma)', () => {
  it('inside window: RefundOperation recorded with REQUESTED status and 24h slaDueAt', async () => {
    mockedPrisma.slotReservation.findFirst.mockResolvedValue(txReservation());

    const outcome = await applyRefundPolicyOnCancellation({ bookingId: 'res-1', actor: 'CUSTOMER_CANCELLATION_LINK', now: NOW });

    expect(outcome.refundRecorded).toBe(true);
    expect(mockedPrisma.refundOperation.create).toHaveBeenCalledTimes(1);
    const data = mockedPrisma.refundOperation.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      orderId: 'order-1',
      kind: 'CRYPTO_REIMBURSEMENT',
      status: 'REQUESTED',
      idempotencyKey: 'cancel_refund_req_order-1',
      amountMinor: 10000,
      currency: 'USD',
      reason: 'CUSTOMER_CANCELLATION_WITHIN_REFUND_WINDOW',
    });
    expect(data.slaDueAt.getTime() - NOW.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it('inside window: customer + staff notified through the dispatch pattern with delivery log', async () => {
    mockedPrisma.slotReservation.findFirst.mockResolvedValue(txReservation());

    const outcome = await applyRefundPolicyOnCancellation({ bookingId: 'res-1', actor: 'STAFF', now: NOW });

    expect(outcome.customerNotified).toBe(true);
    expect(outcome.staffNotified).toBe(true);
    expect(mockedSend).toHaveBeenCalledTimes(2);
    const logged = (logDeliveryAttempt as jest.Mock).mock.calls.map((c) => c[0]);
    expect(logged).toHaveLength(2);
    expect(logged.every((t: { status: string }) => t.status === 'ACCEPTED')).toBe(true);
  });

  it('outside window: no RefundOperation, no notifications (forfeiture)', async () => {
    const late = new Date(APPOINTMENT_START.getTime() - 1000);
    mockedPrisma.slotReservation.findFirst.mockResolvedValue(txReservation());

    const outcome = await applyRefundPolicyOnCancellation({ bookingId: 'res-1', actor: 'STAFF', now: late });

    expect(outcome.verdict?.forfeitDeposit).toBe(true);
    expect(outcome.refundRecorded).toBe(false);
    expect(mockedPrisma.refundOperation.create).not.toHaveBeenCalled();
    expect(mockedSend).not.toHaveBeenCalled();
  });

  it('PAY_ON_SITE: evaluated but nothing recorded', async () => {
    mockedPrisma.slotReservation.findFirst.mockResolvedValue(
      txReservation({ order: { paymentMethod: 'PAY_ON_SITE', status: 'PENDING', paymentRef: null } })
    );

    const outcome = await applyRefundPolicyOnCancellation({ bookingId: 'res-1', actor: 'STAFF', now: NOW });

    expect(outcome.verdict?.applicable).toBe(false);
    expect(mockedPrisma.refundOperation.create).not.toHaveBeenCalled();
    expect(mockedSend).not.toHaveBeenCalled();
  });

  it('idempotent: an existing refund request for the order is not duplicated', async () => {
    mockedPrisma.slotReservation.findFirst.mockResolvedValue(txReservation());
    mockedPrisma.refundOperation.findUnique.mockResolvedValue({ id: 'ref-1' });

    const outcome = await applyRefundPolicyOnCancellation({ bookingId: 'res-1', actor: 'STAFF', now: NOW });

    expect(outcome.refundRecorded).toBe(true);
    expect(mockedPrisma.refundOperation.create).not.toHaveBeenCalled();
  });

  it('Telegram Stars orders get the TELEGRAM_STARS_REFUND kind', async () => {
    mockedPrisma.slotReservation.findFirst.mockResolvedValue(
      txReservation({ order: { paymentMethod: 'TELEGRAM_STARS', paymentRef: 'chg-1' } })
    );

    await applyRefundPolicyOnCancellation({ bookingId: 'res-1', actor: 'STAFF', now: NOW });

    expect(mockedPrisma.refundOperation.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ kind: 'TELEGRAM_STARS_REFUND' }) })
    );
  });
});

describe('cancelBooking wiring (fsmCutover flag-gated, FR-430)', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  function wireTx() {
    mockedPrisma.$transaction.mockImplementation(async (cb: (t: unknown) => unknown) =>
      cb({
        slotReservation: { findFirst: jest.fn().mockResolvedValue(txReservation()), update: jest.fn() },
        order: { update: jest.fn() },
      })
    );
    // Top-level lookup used by the refund policy service after the transaction.
    mockedPrisma.slotReservation.findFirst.mockResolvedValue(txReservation());
  }

  it('flag ON + token cancel inside window: refund request recorded after the cancellation transaction', async () => {
    wireTx();
    await cancelBooking({ bookingId: 'res-1', token: CANCEL_TOKEN });

    expect(mockedPrisma.refundOperation.create).toHaveBeenCalledTimes(1);
    expect(mockedSend).toHaveBeenCalledTimes(2); // customer + staff
  });

  it('flag OFF: legacy behavior untouched — no refund policy evaluation', async () => {
    mockedFlags.mockReturnValue({ fsmCutover: false });
    wireTx();

    await cancelBooking({ bookingId: 'res-1', token: CANCEL_TOKEN });

    expect(mockedPrisma.refundOperation.create).not.toHaveBeenCalled();
    expect(mockedSend).not.toHaveBeenCalled();
  });
});
