import * as fs from 'node:fs';
import {
  getRescheduleSecret,
  generateMagicRescheduleLink,
  verifyMagicRescheduleToken,
  RescheduleSecretUnconfiguredError,
} from '@/lib/bot/magicReschedule';
import { hashDeliveryTarget } from '@/lib/notifications/deliveryLog';
import { fulfillPayment } from '@/lib/payments/fulfillment';
import {
  recordFailedAttempt,
  getLockoutRegistrySize,
  clearLockoutRegistry,
  MAX_LOCKOUT_ENTRIES,
  getLockoutState,
} from '@/lib/security/staffSignIn';
import { prisma } from '@/lib/db/prisma';

jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    $transaction: jest.fn(),
    paymentEvent: { findUnique: jest.fn(), create: jest.fn() },
    paymentAllocationLink: { upsert: jest.fn() },
    order: { findUnique: jest.fn(), update: jest.fn() },
    slotReservation: { findFirst: jest.fn(), update: jest.fn() },
    refundOperation: { create: jest.fn() },
    inboxEvent: { create: jest.fn() },
    notificationDeliveryLog: { create: jest.fn() },
  },
}));

const mockedPrisma = prisma as unknown as {
  $transaction: jest.Mock;
  paymentEvent: { findUnique: jest.Mock; create: jest.Mock };
  paymentAllocationLink: { upsert: jest.Mock };
  order: { findUnique: jest.Mock; update: jest.Mock };
  slotReservation: { findFirst: jest.Mock; update: jest.Mock };
  refundOperation: { create: jest.Mock };
  inboxEvent: { create: jest.Mock };
  notificationDeliveryLog: { create: jest.Mock };
};

describe('007 Fixes: FR-701 Fail-closed reschedule secret', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.STAFF_WEBHOOK_SECRET;
    delete process.env.ADMIN_TOKEN;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('throws RescheduleSecretUnconfiguredError when both env secrets are absent', () => {
    expect(() => getRescheduleSecret()).toThrow(RescheduleSecretUnconfiguredError);
    expect(() =>
      generateMagicRescheduleLink({ orderId: 'ord-1', scheduleVersion: 1 })
    ).toThrow(RescheduleSecretUnconfiguredError);
  });

  it('verifyMagicRescheduleToken returns RESCHEDULE_SECRET_UNCONFIGURED when secrets are missing', () => {
    const dummyToken = Buffer.from('ord-1:1:9999999999:nonce:sig', 'utf-8').toString('base64url');
    const result = verifyMagicRescheduleToken(dummyToken, {
      id: 'ord-1',
      scheduleVersion: 1,
      rescheduleTokenHash: null,
      rescheduleTokenConsumedAt: null,
    });
    expect(result).toEqual({ valid: false, reason: 'RESCHEDULE_SECRET_UNCONFIGURED' });
  });

  it('uses ADMIN_TOKEN fallback when STAFF_WEBHOOK_SECRET is missing', () => {
    process.env.ADMIN_TOKEN = 'fallback-admin-token';
    expect(getRescheduleSecret()).toBe('fallback-admin-token');
  });

  it('prefers STAFF_WEBHOOK_SECRET over ADMIN_TOKEN when both are present', () => {
    process.env.STAFF_WEBHOOK_SECRET = 'primary-staff-secret';
    process.env.ADMIN_TOKEN = 'fallback-admin-token';
    expect(getRescheduleSecret()).toBe('primary-staff-secret');
  });
});

describe('007 Fixes: FR-702 Delivery log salt fail-closed', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.DELIVERY_LOG_SALT;
    delete process.env.ADMIN_TOKEN;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('returns UNHASHED when neither DELIVERY_LOG_SALT nor ADMIN_TOKEN is set', () => {
    expect(hashDeliveryTarget('+79991234567')).toBe('UNHASHED');
  });

  it('hashes deterministically when salt is configured', () => {
    process.env.DELIVERY_LOG_SALT = 'test-salt-123';
    const h1 = hashDeliveryTarget('+79991234567');
    const h2 = hashDeliveryTarget('+79991234567');
    expect(h1).not.toBe('UNHASHED');
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64); // sha256 hex
  });
});

describe('007 Fixes: FR-704 Provider-aware amount & currency invariant in fulfillPayment', () => {
  function makeTx(opts?: { totalMinor?: number; currency?: string }) {
    const order = {
      id: 'order-007',
      totalMinor: opts?.totalMinor ?? 10000,
      currency: opts?.currency ?? 'USD',
      items: [],
      reservation: null,
    };
    return {
      paymentEvent: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'pe-1' }),
      },
      paymentAllocationLink: { upsert: jest.fn().mockResolvedValue({}) },
      order: {
        findUnique: jest.fn().mockResolvedValue(order),
        update: jest.fn().mockResolvedValue(order),
      },
      slotReservation: { findFirst: jest.fn().mockResolvedValue(null), update: jest.fn() },
      refundOperation: { create: jest.fn().mockResolvedValue({ id: 'ref-1' }) },
      inboxEvent: { create: jest.fn().mockResolvedValue({ id: 'inbox-1' }) },
    };
  }

  it('happy path: fiat currency and amount match -> PAID', async () => {
    const tx = makeTx({ totalMinor: 10000, currency: 'USD' });
    mockedPrisma.$transaction.mockImplementation(async (cb: (t: unknown) => unknown) => cb(tx));

    const res = await fulfillPayment({
      orderId: 'order-007',
      provider: 'STRIPE' as never,
      providerRef: 'pi_test_123',
      amountMinor: 10000,
      currency: 'USD',
    });

    expect(res).toEqual({ status: 'PAID', requiresOperatorAction: false });
    expect(tx.refundOperation.create).not.toHaveBeenCalled();
  });

  it('fiat currency mismatch -> PAID_REQUIRES_RESOLUTION + refund request', async () => {
    const tx = makeTx({ totalMinor: 10000, currency: 'USD' });
    mockedPrisma.$transaction.mockImplementation(async (cb: (t: unknown) => unknown) => cb(tx));

    const res = await fulfillPayment({
      orderId: 'order-007',
      provider: 'STRIPE' as never,
      providerRef: 'pi_test_123',
      amountMinor: 10000,
      currency: 'EUR', // order is USD, webhook is EUR
    });

    expect(res).toEqual({ status: 'PAID_REQUIRES_RESOLUTION', requiresOperatorAction: true });
    expect(tx.refundOperation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reason: 'AMOUNT_MISMATCH_MANUAL_RESOLUTION',
          kind: 'STRIPE',
          currency: 'EUR',
        }),
      })
    );
  });

  it('fiat amount mismatch (1 minor underpaid) -> PAID_REQUIRES_RESOLUTION', async () => {
    const tx = makeTx({ totalMinor: 10000, currency: 'USD' });
    mockedPrisma.$transaction.mockImplementation(async (cb: (t: unknown) => unknown) => cb(tx));

    const res = await fulfillPayment({
      orderId: 'order-007',
      provider: 'CRYPTO_GATEWAY',
      providerRef: 'np_123',
      amountMinor: 9999, // 1 cent underpaid
      currency: 'USD',
    });

    expect(res).toEqual({ status: 'PAID_REQUIRES_RESOLUTION', requiresOperatorAction: true });
    expect(tx.refundOperation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          idempotencyKey: 'amount_mismatch_order-007_np_123',
          kind: 'CRYPTO_REIMBURSEMENT',
        }),
      })
    );
  });

  it('Telegram Stars: valid XTR calculation -> PAID (no false mismatch)', async () => {
    // 10000 minor cents ($100) -> 5000 stars (totalMinor / 2)
    const tx = makeTx({ totalMinor: 10000, currency: 'USD' });
    mockedPrisma.$transaction.mockImplementation(async (cb: (t: unknown) => unknown) => cb(tx));

    const res = await fulfillPayment({
      orderId: 'order-007',
      provider: 'TELEGRAM_STARS',
      providerRef: 'chg_stars_1',
      amountMinor: 5000,
      currency: 'XTR',
    });

    expect(res).toEqual({ status: 'PAID', requiresOperatorAction: false });
    expect(tx.refundOperation.create).not.toHaveBeenCalled();
  });

  it('Telegram Stars: wrong stars count -> PAID_REQUIRES_RESOLUTION + TELEGRAM_STARS_REFUND', async () => {
    const tx = makeTx({ totalMinor: 10000, currency: 'USD' });
    mockedPrisma.$transaction.mockImplementation(async (cb: (t: unknown) => unknown) => cb(tx));

    const res = await fulfillPayment({
      orderId: 'order-007',
      provider: 'TELEGRAM_STARS',
      providerRef: 'chg_stars_1',
      amountMinor: 4999, // 1 star missing
      currency: 'XTR',
    });

    expect(res).toEqual({ status: 'PAID_REQUIRES_RESOLUTION', requiresOperatorAction: true });
    expect(tx.refundOperation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          kind: 'TELEGRAM_STARS_REFUND',
          reason: 'AMOUNT_MISMATCH_MANUAL_RESOLUTION',
        }),
      })
    );
  });
});

describe('007 Fixes: FR-706 Lockout registry capacity & eviction', () => {
  beforeEach(() => {
    clearLockoutRegistry();
  });

  it('enforces hard-cap 1000 entries when spraying records', () => {
    // Spray 1200 records
    for (let i = 0; i < 1200; i++) {
      recordFailedAttempt(`user_${i}@example.com`);
    }

    expect(getLockoutRegistrySize()).toBeLessThanOrEqual(MAX_LOCKOUT_ENTRIES);
    expect(getLockoutRegistrySize()).toBe(1000);
  });

  it('emergency evicts active lock with min(lockedUntil) when all 1000 entries are active', () => {
    // Fill 1000 active locks (5 fails each)
    for (let i = 0; i < 1000; i++) {
      for (let attempt = 0; attempt < 5; attempt++) {
        recordFailedAttempt(`active_${i}@example.com`);
      }
    }

    expect(getLockoutRegistrySize()).toBe(1000);

    // 1001st active lock must not grow beyond 1000
    for (let attempt = 0; attempt < 5; attempt++) {
      recordFailedAttempt(`active_1001@example.com`);
    }

    expect(getLockoutRegistrySize()).toBe(1000);
    expect(getLockoutState('active_1001@example.com')).toBeDefined();
  });

  it('measures RSS during 5000 spray attempts and writes lockout-rss.json evidence (NFR-703, TC-007-016)', () => {
    clearLockoutRegistry();
    const beforeRss = process.memoryUsage().rss;
    const t0 = Date.now();
    for (let i = 0; i < 5000; i++) {
      recordFailedAttempt(`spray_${i}@attacker.dev`);
    }
    const elapsedMs = Date.now() - t0;
    const afterRss = process.memoryUsage().rss;
    const size = getLockoutRegistrySize();
    const evidence = {
      timestamp: new Date().toISOString(),
      sprayAttempts: 5000,
      elapsedMs,
      registrySize: size,
      maxEntriesLimit: 1000,
      rssBeforeBytes: beforeRss,
      rssAfterBytes: afterRss,
      rssBeforeMb: Math.round((beforeRss / (1024 * 1024)) * 100) / 100,
      rssAfterMb: Math.round((afterRss / (1024 * 1024)) * 100) / 100,
      budgetMb: 500,
      status: size <= 1000 && afterRss / (1024 * 1024) <= 500 ? 'PASS' : 'FAIL',
    };
    fs.mkdirSync('specs/007-code-review-fixes/evidence', { recursive: true });
    fs.writeFileSync(
      'specs/007-code-review-fixes/evidence/lockout-rss.json',
      JSON.stringify(evidence, null, 2) + '\n'
    );
    expect(size).toBeLessThanOrEqual(1000);
    expect(afterRss / (1024 * 1024)).toBeLessThanOrEqual(500);
  });
});
