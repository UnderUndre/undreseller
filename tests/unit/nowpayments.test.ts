import { createHmac } from 'node:crypto';
import {
  verifyNowPaymentsSignature,
  processNowPaymentsNotification,
} from '@/lib/payments/nowpayments';

jest.mock('@/lib/payments/fulfillment', () => ({
  fulfillPayment: jest.fn().mockResolvedValue({ status: 'PAID', requiresOperatorAction: false }),
}));

jest.mock('@/lib/bot/telegramBot', () => ({
  bot: {
    api: {
      sendMessage: jest.fn().mockResolvedValue(true),
    },
  },
  sendWithRetry: jest.fn((fn) => fn()),
}));

describe('NOWPayments IPN Signature & Verification (T-029)', () => {
  const originalEnv = process.env;
  const IPN_SECRET = 'super_secret_nowpayments_ipn_key_999';

  beforeEach(() => {
    process.env = { ...originalEnv, NOWPAYMENTS_IPN_SECRET: IPN_SECRET };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  function calculateValidSignature(payload: Record<string, unknown>): string {
    const sortedKeys = Object.keys(payload).sort();
    const sortedObj: Record<string, unknown> = {};
    for (const key of sortedKeys) {
      sortedObj[key] = payload[key];
    }
    return createHmac('sha512', IPN_SECRET).update(JSON.stringify(sortedObj)).digest('hex');
  }

  it('validates canonical signature with matching IPN secret', () => {
    const payload = {
      payment_id: 12345678,
      payment_status: 'finished',
      pay_amount: 100,
      actually_paid: 100,
      price_amount: 100,
      price_currency: 'usd',
      order_id: 'order-uuid-1',
    };

    const sig = calculateValidSignature(payload);
    expect(verifyNowPaymentsSignature(payload, sig)).toBe(true);
  });

  it('validates signature regardless of top-level key order (canonical sorting)', () => {
    // Unsorted keys in object
    const payload = {
      order_id: 'order-uuid-2',
      price_currency: 'usd',
      payment_id: 8888,
      actually_paid: 50,
      pay_amount: 50,
      payment_status: 'finished',
      price_amount: 50,
    };

    const sig = calculateValidSignature(payload);
    // Keys passed in another order
    const reorderedPayload = {
      actually_paid: 50,
      order_id: 'order-uuid-2',
      pay_amount: 50,
      payment_id: 8888,
      payment_status: 'finished',
      price_amount: 50,
      price_currency: 'usd',
    };

    expect(verifyNowPaymentsSignature(reorderedPayload, sig)).toBe(true);
  });

  it('rejects tampered amount or invalid secret', () => {
    const payload = {
      payment_id: 12345,
      payment_status: 'finished',
      pay_amount: 100,
      actually_paid: 100,
      order_id: 'order-uuid-3',
    };
    const validSig = calculateValidSignature(payload);

    // Tampered payload
    const tamperedPayload = { ...payload, actually_paid: 50 };
    expect(verifyNowPaymentsSignature(tamperedPayload, validSig)).toBe(false);

    // Wrong secret in env
    process.env.NOWPAYMENTS_IPN_SECRET = 'wrong_secret';
    expect(verifyNowPaymentsSignature(payload, validSig)).toBe(false);
  });

  it('triggers underpayment alert when paid/quoted ratio < 0.99', async () => {
    const payload = {
      payment_id: 7777,
      payment_status: 'finished',
      pay_amount: 100,
      actually_paid: 98, // 98% -> underpaid!
      price_amount: 100,
      price_currency: 'usd',
      pay_currency: 'usdt',
      order_id: 'order-uuid-underpaid',
    };

    const result = await processNowPaymentsNotification(payload as any);
    expect(result.status).toBe('UNDERPAID');
  });
});
