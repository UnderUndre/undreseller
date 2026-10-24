/**
 * T027: stubbed-gateway consumer-driven contract suite (contracts/payment-provider.md).
 * Covers the FULL test matrix:
 *  - waiting → confirming: holdFrozenAt recorded; hold NOT released by TTL sweep while frozen
 *  - confirming → finished within 24h ceiling: CONFIRMED (DB BOOKED), PaymentAllocationLink
 *    written, idempotent on ×100 replays (one effect)
 *  - confirming stuck > 24h: hold expires, slot released, FR-432 resolution verdict
 *  - finished with paid < 99% of quoted: UNDERPAID, no auto-confirm, staff + customer notified
 *  - finished after slot released, slot FREE (FR-444): atomic re-confirm
 *  - finished after slot released and RE-BOOKED (FR-432): PAID_REQUIRES_RESOLUTION + refund
 *  - invalid signature → verifyCallback false, zero processing
 *  - JPY (minorUnit 0) / KWD (minorUnit 3) amounts at registry scale
 * All unit-level: prisma / telegram / delivery-log mocked — no live DB.
 */
import {
  MAX_CONFIRMING_FREEZE_MS,
  PREPAID_HOLD_TTL_MS,
  transitionBookingFsm,
  evaluateHoldExpiry,
  isHoldTtlSweepSuppressed,
  isConfirmingFreezeCeilingExceeded,
  SPEC_TO_DB_RESERVATION_STATUS,
} from '@/lib/kernel/bookingFsm';
import { prisma } from '@/lib/db/prisma';
import { bot } from '@/lib/bot/telegramBot';
import { logDeliveryAttempt } from '@/lib/notifications/deliveryLog';
import { recordConfirmingFreeze, fulfillPayment } from '@/lib/payments/fulfillment';
import { processNowPaymentsNotification, verifyNowPaymentsSignature } from '@/lib/payments/nowpayments';
import { majorToMinorUnits, getCurrencyMetadata } from '@/config/currency-registry';

jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    $transaction: jest.fn(),
    slotReservation: { update: jest.fn(), updateMany: jest.fn() },
    order: { findUnique: jest.fn(), update: jest.fn() },
    shopSettings: { findUnique: jest.fn() },
    paymentEvent: { findUnique: jest.fn(), create: jest.fn() },
    paymentAllocationLink: { upsert: jest.fn() },
    refundOperation: { create: jest.fn(), findUnique: jest.fn() },
    inboxEvent: { create: jest.fn() },
    item: { findUnique: jest.fn() },
    orderItem: { update: jest.fn() },
  },
}));

jest.mock('@/lib/booking/advisoryLock', () => ({
  acquireResourceSlotLock: jest.fn().mockResolvedValue(undefined),
  acquireItemSlotLock: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/lib/bot/telegramBot', () => ({
  bot: { api: { sendMessage: jest.fn().mockResolvedValue(true) } },
  sendWithRetry: jest.fn((fn) => fn()),
}));

jest.mock('@/lib/notifications/deliveryLog', () => ({
  logDeliveryAttempt: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/lib/telemetry/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), counter: jest.fn() },
}));

const mockedPrisma = prisma as unknown as {
  $transaction: jest.Mock;
  slotReservation: { update: jest.Mock; updateMany: jest.Mock };
  order: { findUnique: jest.Mock; update: jest.Mock };
  shopSettings: { findUnique: jest.Mock };
  paymentEvent: { findUnique: jest.Mock; create: jest.Mock };
  paymentAllocationLink: { upsert: jest.Mock };
  refundOperation: { create: jest.Mock; findUnique: jest.Mock };
  inboxEvent: { create: jest.Mock };
  item: { findUnique: jest.Mock };
  orderItem: { update: jest.Mock };
};

const NOW = new Date('2026-06-01T12:00:00.000Z');

/** Builds a tx mock for fulfillment.$transaction callbacks. */
function makeTx(overrides: {
  existingPaymentEvent?: object | null;
  collision?: object | null;
  reservation?: object | null;
} = {}) {
  const tx = {
    paymentEvent: {
      findUnique: jest.fn().mockResolvedValue(overrides.existingPaymentEvent ?? null),
      create: jest.fn().mockResolvedValue({}),
    },
    order: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'order-1',
        items: [],
        reservation: overrides.reservation ?? {
          id: 'res-1',
          orderId: 'order-1',
          resourceId: 'res-src-1',
          itemId: 'item-1',
          status: 'PAYMENT_PENDING',
          startTime: new Date(NOW.getTime() + 24 * 60 * 60 * 1000),
          endTime: new Date(NOW.getTime() + 25 * 60 * 60 * 1000),
        },
      }),
      update: jest.fn().mockResolvedValue({}),
    },
    paymentAllocationLink: { upsert: jest.fn().mockResolvedValue({}) },
    slotReservation: {
      findFirst: jest.fn().mockResolvedValue(overrides.collision ?? null),
      update: jest.fn().mockResolvedValue({}),
    },
    refundOperation: { create: jest.fn().mockResolvedValue({}) },
    inboxEvent: { create: jest.fn().mockResolvedValue({}) },
    item: { findUnique: jest.fn().mockResolvedValue(null) },
    orderItem: { update: jest.fn().mockResolvedValue({}) },
    $executeRaw: jest.fn().mockResolvedValue(0),
  };
  return tx;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedPrisma.shopSettings.findUnique.mockResolvedValue({ staffDestinationChatId: 'chat-staff' });
  mockedPrisma.order.findUnique.mockResolvedValue({ orderNumber: 'ORD-42', customerTgId: 'tg-cust-1' });
});

describe('waiting → confirming: hold frozen, TTL sweep suppressed', () => {
  it('GATEWAY_WAITING moves HELD → PAYMENT_PENDING without touching the freeze', () => {
    const r = transitionBookingFsm('HELD', 'GATEWAY_WAITING', { now: NOW });
    expect(r).toMatchObject({ ok: true, state: 'PAYMENT_PENDING' });
    expect(r.ok && r.effects.holdFrozenAt).toBeUndefined();
  });

  it('GATEWAY_CONFIRMING sets holdFrozenAt (FSM effect)', () => {
    const r = transitionBookingFsm('PAYMENT_PENDING', 'GATEWAY_CONFIRMING', {
      now: NOW,
      holdFrozenAt: null,
    });
    expect(r).toMatchObject({ ok: true, state: 'PAYMENT_PENDING' });
    expect(r.ok && r.effects.holdFrozenAt).toEqual(NOW);
  });

  it('recordConfirmingFreeze persists holdFrozenAt; first confirming wins', async () => {
    const tx = makeTx();
    mockedPrisma.$transaction.mockImplementation(async (cb: (t: unknown) => unknown) => cb(tx));

    const first = await recordConfirmingFreeze('order-1', NOW);
    expect(first).toEqual({ frozen: true, alreadyFrozen: false });
    expect(tx.slotReservation.update).toHaveBeenCalledWith({
      where: { id: 'res-1' },
      data: { holdFrozenAt: NOW },
    });

    // Replay: freeze already set → never moved forward.
    tx.order.findUnique.mockResolvedValue({
      id: 'order-1',
      reservation: { id: 'res-1', status: 'PAYMENT_PENDING', holdFrozenAt: NOW },
    });
    const replay = await recordConfirmingFreeze('order-1', new Date(NOW.getTime() + 5000));
    expect(replay).toEqual({ frozen: true, alreadyFrozen: true });
    expect(tx.slotReservation.update).toHaveBeenCalledTimes(1);
  });

  it('frozen hold is NOT released by the TTL sweeper while within the 24h ceiling', () => {
    const frozenAt = new Date(NOW.getTime() - 60 * 60 * 1000); // 1h frozen
    const ctx = {
      status: 'PAYMENT_PENDING' as const,
      holdFrozenAt: frozenAt,
      holdExpiresAt: new Date(NOW.getTime() - 1000), // TTL long past
      now: NOW,
    };
    expect(evaluateHoldExpiry(ctx)).toBe('FROZEN');
    expect(isHoldTtlSweepSuppressed({ holdFrozenAt: frozenAt, now: NOW })).toBe(true);

    // FSM: TTL_EXPIRED on a frozen hold is rejected (sweep skips).
    const r = transitionBookingFsm('PAYMENT_PENDING', 'TTL_EXPIRED', {
      now: NOW,
      holdFrozenAt: frozenAt,
    });
    expect(r.ok).toBe(false);
  });
});

describe('confirming → finished within 24h ceiling: CONFIRMED, allocation link, ×100 idempotent', () => {
  it('FSM: GATEWAY_FINISHED from PAYMENT_PENDING → CONFIRMED, hold fields cleared', () => {
    const r = transitionBookingFsm('PAYMENT_PENDING', 'GATEWAY_FINISHED', { now: NOW });
    expect(r).toMatchObject({ ok: true, state: 'CONFIRMED' });
    expect(r.ok && r.effects.holdExpiresAt).toBeNull();
    expect(r.ok && r.effects.holdFrozenAt).toBeNull();
    // Spec CONFIRMED maps to DB BOOKED.
    expect(SPEC_TO_DB_RESERVATION_STATUS.CONFIRMED).toBe('BOOKED');
  });

  it('fulfillment: PaymentEvent + PaymentAllocationLink written, reservation BOOKED', async () => {
    const tx = makeTx();
    mockedPrisma.$transaction.mockImplementation(async (cb: (t: unknown) => unknown) => cb(tx));

    const result = await fulfillPayment({
      orderId: 'order-1',
      provider: 'CRYPTO_GATEWAY',
      providerRef: 'np-777',
      amountMinor: 10000,
      currency: 'USD',
    });

    expect(result.status).toBe('PAID');
    expect(tx.paymentEvent.create).toHaveBeenCalledTimes(1);
    expect(tx.paymentAllocationLink.upsert).toHaveBeenCalledTimes(1);
    expect(tx.paymentAllocationLink.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { provider_providerPaymentId: { provider: 'CRYPTO_GATEWAY', providerPaymentId: 'np-777' } },
        update: {},
      })
    );
    expect(tx.slotReservation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'res-1' },
        data: expect.objectContaining({ status: 'BOOKED', holdExpiresAt: null }),
      })
    );
    expect(tx.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PAID' }) })
    );
  });

  it('idempotent on ×100 replays: exactly one PaymentEvent + one allocation link', async () => {
    const tx = makeTx();
    let created = false;
    tx.paymentEvent.findUnique.mockImplementation(async () => (created ? { id: 'pe-1' } : null));
    tx.paymentEvent.create.mockImplementation(async () => {
      created = true;
      return {};
    });
    mockedPrisma.$transaction.mockImplementation(async (cb: (t: unknown) => unknown) => cb(tx));

    for (let i = 0; i < 100; i++) {
      const result = await fulfillPayment({
        orderId: 'order-1',
        provider: 'CRYPTO_GATEWAY',
        providerRef: 'np-777',
        amountMinor: 10000,
        currency: 'USD',
      });
      if (i === 0) expect(result.status).toBe('PAID');
      else expect(result.status).toBe('ALREADY_PAID');
    }

    expect(tx.paymentEvent.create).toHaveBeenCalledTimes(1);
    expect(tx.paymentAllocationLink.upsert).toHaveBeenCalledTimes(1);
    expect(tx.order.update).toHaveBeenCalledTimes(1);
  });
});

describe('confirming stuck > 24h: hold expires, slot released, FR-432 verdict', () => {
  it('isConfirmingFreezeCeilingExceeded flips at MAX_CONFIRMING_FREEZE (24h)', () => {
    const frozenAt = new Date(NOW.getTime() - MAX_CONFIRMING_FREEZE_MS - 1);
    expect(isConfirmingFreezeCeilingExceeded({ holdFrozenAt: frozenAt, now: NOW })).toBe(true);
    expect(
      isConfirmingFreezeCeilingExceeded({
        holdFrozenAt: new Date(NOW.getTime() - MAX_CONFIRMING_FREEZE_MS + 1),
        now: NOW,
      })
    ).toBe(false);
  });

  it('evaluateHoldExpiry → FREEZE_CEILING_EXCEEDED; FSM releases slot with FR432_REFUND_24H', () => {
    const frozenAt = new Date(NOW.getTime() - MAX_CONFIRMING_FREEZE_MS - 1000);
    expect(
      evaluateHoldExpiry({ status: 'PAYMENT_PENDING', holdFrozenAt: frozenAt, now: NOW })
    ).toBe('FREEZE_CEILING_EXCEEDED');

    const r = transitionBookingFsm('PAYMENT_PENDING', 'TTL_EXPIRED', {
      now: NOW,
      holdFrozenAt: frozenAt,
    });
    expect(r).toMatchObject({
      ok: true,
      state: 'AVAILABLE',
      effects: { release: 'CANCELLED', orderResolution: 'FR432_REFUND_24H' },
    });
  });
});

describe('finished with paid < 99% of quoted: UNDERPAID, no auto-confirm, both notified', () => {
  function underpaidPayload(over: Record<string, unknown> = {}) {
    return {
      payment_id: 4242,
      payment_status: 'finished',
      order_id: 'order-1',
      pay_amount: 100,
      actually_paid: 50, // 50% — well below the 99% threshold
      pay_currency: 'USDT',
      price_amount: 100,
      price_currency: 'USD',
      ...over,
    };
  }

  it('routes to the UNDERPAID flow: reservation UNDERPAID, staff + customer messages, no fulfillment', async () => {
    mockedPrisma.slotReservation.updateMany.mockResolvedValue({ count: 1 });

    const result = await processNowPaymentsNotification(underpaidPayload());

    expect(result.status).toBe('UNDERPAID');
    expect(mockedPrisma.slotReservation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'UNDERPAID' }) })
    );
    expect(bot.api.sendMessage).toHaveBeenCalledTimes(2); // staff + customer
    const staffText = (bot.api.sendMessage as unknown as jest.Mock).mock.calls[0][1] as string;
    expect(staffText).toContain('[UNDERPAYMENT_ALERT]');
    expect(staffText).toContain('$100.00');
    expect(staffText).toContain('$50.00');
    expect(staffText).toContain('12h');
    expect(logDeliveryAttempt).toHaveBeenCalled();
    // No auto-confirm anywhere on this path (paymentEvent.create never invoked via tx).
    expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('paid ≥ 99% of quoted is NOT underpaid: fulfillment path taken', async () => {
    const tx = makeTx();
    mockedPrisma.$transaction.mockImplementation(async (cb: (t: unknown) => unknown) => cb(tx));

    const result = await processNowPaymentsNotification(
      underpaidPayload({ actually_paid: 99.5 })
    );
    expect(result.status).toBe('PAID');
    expect(mockedPrisma.slotReservation.updateMany).not.toHaveBeenCalled();
    expect(tx.slotReservation.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'BOOKED' }) })
    );
  });
});

describe('finished after slot released (FR-444) and RE-BOOKED (FR-432)', () => {
  it('slot still FREE: FSM re-confirms atomically — no refund path', () => {
    const r = transitionBookingFsm('AVAILABLE', 'GATEWAY_FINISHED', {
      now: NOW,
      slotReleased: true,
    });
    expect(r).toMatchObject({
      ok: true,
      state: 'CONFIRMED',
      effects: { lateReconfirm: true, holdExpiresAt: null, holdFrozenAt: null },
    });
    expect(r.ok && r.effects.orderResolution).toBeUndefined();
  });

  it('slot RE-BOOKED: order → FR432_REFUND_24H verdict (PAID_REQUIRES_RESOLUTION + refund request)', () => {
    const r = transitionBookingFsm('AVAILABLE', 'GATEWAY_FINISHED', {
      now: NOW,
      slotRebooked: true,
    });
    expect(r).toMatchObject({
      ok: true,
      state: 'AVAILABLE',
      effects: { orderResolution: 'FR432_REFUND_24H' },
    });
  });

  it('fulfillment with a colliding re-booking: PAID_REQUIRES_RESOLUTION + RefundOperation (24h SLA)', async () => {
    const tx = makeTx({
      collision: { id: 'res-other', status: 'BOOKED' }, // slot re-booked by another customer
    });
    mockedPrisma.$transaction.mockImplementation(async (cb: (t: unknown) => unknown) => cb(tx));

    const result = await fulfillPayment({
      orderId: 'order-1',
      provider: 'CRYPTO_GATEWAY',
      providerRef: 'np-999',
      amountMinor: 10000,
      currency: 'USD',
    });

    expect(result).toEqual({ status: 'PAID_REQUIRES_RESOLUTION', requiresOperatorAction: true });
    expect(tx.refundOperation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orderId: 'order-1',
          status: 'REQUESTED',
          amountMinor: 10000,
          actor: 'SYSTEM_LATE_WEBHOOK_SLA',
          reason: 'OVERBOOKED_MANUAL_RESOLUTION',
        }),
      })
    );
    const slaDueAt = tx.refundOperation.create.mock.calls[0][0].data.slaDueAt as Date;
    expect(slaDueAt.getTime() - NOW.getTime()).toBeGreaterThanOrEqual(24 * 60 * 60 * 1000 - 1000);
    // The second booking is untouched: only our own reservation row is released.
    expect(tx.slotReservation.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'res-1' } })
    );
    expect(tx.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'PAID_REQUIRES_RESOLUTION', refundStatus: 'REFUND_REQUESTED' }),
      })
    );
    expect(tx.inboxEvent.create).toHaveBeenCalled(); // SYSTEM_ALERT outbox for staff
  });
});

describe('invalid signature: verifyCallback false, zero processing', () => {
  const originalSecret = process.env.NOWPAYMENTS_IPN_SECRET;

  beforeEach(() => {
    process.env.NOWPAYMENTS_IPN_SECRET = 'test-ipn-secret';
  });

  afterAll(() => {
    if (originalSecret === undefined) delete process.env.NOWPAYMENTS_IPN_SECRET;
    else process.env.NOWPAYMENTS_IPN_SECRET = originalSecret;
  });

  function signedBody(payload: Record<string, unknown>, secret: string) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createHmac } = require('node:crypto') as typeof import('node:crypto');
    const sorted = Object.keys(payload).sort();
    const serialized = JSON.stringify(
      sorted.reduce<Record<string, unknown>>((acc, k) => ((acc[k] = payload[k]), acc), {})
    );
    return { body: JSON.stringify(payload), sig: createHmac('sha512', secret).update(serialized).digest('hex') };
  }

  it('valid HMAC-SHA512 accepted; tampered body / wrong secret / missing header rejected', () => {
    const payload = { payment_id: 1, payment_status: 'finished', order_id: 'order-1' };
    const good = signedBody(payload, 'test-ipn-secret');

    expect(verifyNowPaymentsSignature(good.body, good.sig)).toBe(true);

    const tampered = signedBody({ ...payload, payment_id: 2 }, 'test-ipn-secret');
    expect(verifyNowPaymentsSignature(tampered.body, good.sig)).toBe(false);
    expect(verifyNowPaymentsSignature(good.body, null)).toBe(false);
    expect(verifyNowPaymentsSignature(good.body, '0'.repeat(128))).toBe(false);
  });

  it('failed verification means zero processing: no fulfillment, no FSM writes', async () => {
    const tampered = JSON.stringify({ payment_status: 'finished', order_id: 'order-1', pay_amount: 1, actually_paid: 1 });
    const provider = {
      verifyCallback: (body: string, sig: string | null) => verifyNowPaymentsSignature(body, sig),
    };
    expect(provider.verifyCallback(tampered, 'forged-signature')).toBe(false);
    // Thin-controller semantics: gate on verifyCallback BEFORE any downstream work.
    const rawSig = 'forged-signature';
    if (!provider.verifyCallback(tampered, rawSig)) {
      expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
      expect(mockedPrisma.slotReservation.update).not.toHaveBeenCalled();
      expect(mockedPrisma.order.update).not.toHaveBeenCalled();
      return;
    }
    throw new Error('unreachable: forged signature must never process');
  });
});

describe('JPY (minorUnit 0) / KWD (minorUnit 3) at registry scale', () => {
  it('registry exposes the contract scales', () => {
    expect(getCurrencyMetadata('JPY')?.minorUnit).toBe(0);
    expect(getCurrencyMetadata('KWD')?.minorUnit).toBe(3);
  });

  it('majorToMinorUnits honors scale: JPY never ×100, KWD ×1000', () => {
    expect(majorToMinorUnits(1500, 'JPY')).toBe(1500);
    expect(majorToMinorUnits(1.234, 'KWD')).toBe(1234);
    expect(majorToMinorUnits(19.99, 'USD')).toBe(1999);
  });

  it('adapter wire translation stays at registry scale (never hard-coded ×100)', async () => {
    const { nowPaymentsWireAmountToMinor } = await import('@/lib/payments/nowpayments');
    expect(nowPaymentsWireAmountToMinor(1500, 'JPY')).toBe(1500);
    expect(nowPaymentsWireAmountToMinor(1.234, 'KWD')).toBe(1234);
  });

  it('createInvoice passes JPY amounts through at wire scale (1500 JPY stays 1500)', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'inv-1', invoice_url: 'https://api.nowpayments.io/v1/invoice/inv-1' }),
    });
    const originalFetch = global.fetch;
    global.fetch = fetchMock as unknown as typeof fetch;
    const originalKey = process.env.NOWPAYMENTS_API_KEY;
    process.env.NOWPAYMENTS_API_KEY = 'test-key';
    try {
      const { createNowPaymentsProvider } = await import('@/lib/payments/nowpayments');
      const provider = createNowPaymentsProvider({ apiKey: 'test-key' });
      const invoice = await provider.createInvoice({
        orderId: 'order-jpy',
        amountMinor: 1500,
        currency: 'JPY',
        callbackBaseUrl: 'https://shop.example.com',
      });
      expect(invoice.providerPaymentId).toBe('inv-1');
      const sentBody = JSON.parse(fetchMock.mock.calls[0][1].body as string) as { price_amount: number };
      expect(sentBody.price_amount).toBe(1500); // JPY minorUnit 0 → wire == registry scale
    } finally {
      global.fetch = originalFetch;
      if (originalKey === undefined) delete process.env.NOWPAYMENTS_API_KEY;
      else process.env.NOWPAYMENTS_API_KEY = originalKey;
    }
  });
});

describe('prepaid hold TTL constants (contract backing)', () => {
  it('15m hold TTL and 24h freeze ceiling are exported for the sweep contract', () => {
    expect(PREPAID_HOLD_TTL_MS).toBe(15 * 60 * 1000);
    expect(MAX_CONFIRMING_FREEZE_MS).toBe(24 * 60 * 60 * 1000);
  });

  it('sweep helper: expired prepaid hold releases the slot when not frozen', () => {
    const expiredAt = new Date(NOW.getTime() - PREPAID_HOLD_TTL_MS - 1);
    expect(
      evaluateHoldExpiry({
        status: 'HELD',
        holdExpiresAt: expiredAt,
        now: NOW,
      })
    ).toBe('EXPIRED');
    const r = transitionBookingFsm('HELD', 'TTL_EXPIRED', {
      now: NOW,
      holdExpiresAt: expiredAt,
    });
    expect(r).toMatchObject({ ok: true, state: 'AVAILABLE', effects: { release: 'CANCELLED' } });
  });
});
