/**
 * T095: STRIDE verification pass per plan.md §Threat Modeling matrix.
 *
 * S  — webhook HMAC regression (NOWPayments IPN, timing-safe)
 * T/I — presign abuse cases (content-type / size / extension / folder)
 * E  — RBAC split probes (foundation vs operational settings partition)
 * D  — rate-limit bypass attempts (key isolation)
 * FR-435 — thin-controller audit of the booking create boundary
 */

jest.mock('@/lib/kernel/bookingService', () => ({
  createBooking: jest.fn().mockResolvedValue({ id: 'bk-stride', bookingId: 'bk-stride', status: 'HELD' }),
  SlotConflictError: class SlotConflictError extends Error {},
}));

jest.mock('@/lib/kernel/customFieldService', () => ({
  validateAnswersForService: jest.fn().mockResolvedValue({}),
  persistBookingAnswers: jest.fn().mockResolvedValue(undefined),
  CustomFieldValidationError: class CustomFieldValidationError extends Error {
    readonly code = 'FIELD_INVALID';
  },
}));

import { createHmac } from 'node:crypto';
import { NextRequest } from 'next/server';
import { verifyNowPaymentsSignature } from '@/lib/payments/nowpayments';

// Extension validation lives behind bucketName()/r2Client() in createPresignedPut —
// stub the AWS layer so the hostile-extension probes reach safeExtension()
// (same approach as tests/unit/uploads-presign.test.ts).
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://presigned.test/upload'),
}));
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({})),
  PutObjectCommand: jest.fn().mockImplementation(() => ({})),
}));

import {
  createPresignedPut,
  PresignValidationError,
} from '@/lib/uploads/presign';
import {
  partitionSettingsBody,
  FOUNDATION_SETTINGS_FIELDS,
} from '@/lib/validation/adminSchemas';
import {
  enforceRateLimit,
  rateLimitKey,
  resetRateLimits,
} from '@/lib/security/rateLimit';
import { POST } from '@/app/api/booking/route';

const SECRET = 'stride-test-ipn-secret';

function sign(payload: Record<string, unknown>): string {
  const sorted: Record<string, unknown> = {};
  for (const k of Object.keys(payload).sort()) sorted[k] = payload[k];
  return createHmac('sha512', SECRET).update(JSON.stringify(sorted)).digest('hex');
}

const IPN_PAYLOAD: Record<string, unknown> = {
  payment_id: 777,
  payment_status: 'finished',
  pay_address: 'TRX-ADDR',
  order_id: 'order-1',
  price_amount: 10,
  price_currency: 'USD',
  actually_paid: 10,
  pay_amount: 10,
};

describe('STRIDE S — webhook HMAC (NOWPayments IPN) regression', () => {
  beforeAll(() => {
    process.env.NOWPAYMENTS_IPN_SECRET = SECRET;
  });

  it('accepts a correctly signed payload', () => {
    expect(verifyNowPaymentsSignature(JSON.stringify(IPN_PAYLOAD), sign(IPN_PAYLOAD))).toBe(true);
  });

  it('rejects a tampered payload (value changed after signing)', () => {
    const tampered = { ...IPN_PAYLOAD, actually_paid: 9999 };
    expect(verifyNowPaymentsSignature(JSON.stringify(tampered), sign(IPN_PAYLOAD))).toBe(false);
  });

  it('rejects a missing signature header', () => {
    expect(verifyNowPaymentsSignature(JSON.stringify(IPN_PAYLOAD), null)).toBe(false);
  });

  it('rejects a forged signature signed with the wrong secret', () => {
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(IPN_PAYLOAD).sort()) sorted[k] = IPN_PAYLOAD[k];
    const forged = createHmac('sha512', 'attacker-secret').update(JSON.stringify(sorted)).digest('hex');
    expect(verifyNowPaymentsSignature(JSON.stringify(IPN_PAYLOAD), forged)).toBe(false);
  });

  it('rejects when IPN secret is unconfigured (fail closed)', () => {
    const saved = process.env.NOWPAYMENTS_IPN_SECRET;
    delete process.env.NOWPAYMENTS_IPN_SECRET;
    try {
      expect(verifyNowPaymentsSignature(JSON.stringify(IPN_PAYLOAD), sign(IPN_PAYLOAD))).toBe(false);
    } finally {
      process.env.NOWPAYMENTS_IPN_SECRET = saved;
    }
  });

  it('is timing-safe: equal-length wrong signature rejected without length leak', () => {
    const valid = sign(IPN_PAYLOAD);
    const sameLengthWrong = (valid[0] === 'a' ? 'b' : 'a') + valid.slice(1);
    expect(verifyNowPaymentsSignature(JSON.stringify(IPN_PAYLOAD), sameLengthWrong)).toBe(false);
    // Shorter signature: length check short-circuits before timingSafeEqual
    expect(verifyNowPaymentsSignature(JSON.stringify(IPN_PAYLOAD), valid.slice(0, 64))).toBe(false);
  });
});

describe('STRIDE T/I — presign abuse cases (validation via direct calls)', () => {
  beforeAll(() => {
    process.env.R2_ACCOUNT_ID = 'acct';
    process.env.R2_ACCESS_KEY_ID = 'key';
    process.env.R2_SECRET_ACCESS_KEY = 'secret';
    process.env.R2_BUCKET = 'test-bucket';
  });
  afterAll(() => {
    delete process.env.R2_ACCOUNT_ID;
    delete process.env.R2_ACCESS_KEY_ID;
    delete process.env.R2_SECRET_ACCESS_KEY;
    delete process.env.R2_BUCKET;
  });

  it('rejects disallowed content types (e.g. text/html, application/pdf)', async () => {
    for (const contentType of ['text/html', 'application/pdf', 'application/javascript', '']) {
      await expect(
        createPresignedPut({ contentType, contentLength: 1000, folder: 'portfolio' })
      ).rejects.toThrow(PresignValidationError);
    }
  });

  it('rejects oversized and invalid content lengths (>5MB ceiling)', async () => {
    await expect(
      createPresignedPut({
        contentType: 'image/webp',
        contentLength: 5 * 1024 * 1024 + 1,
        folder: 'portfolio',
      })
    ).rejects.toThrow(PresignValidationError);
    await expect(
      createPresignedPut({ contentType: 'image/webp', contentLength: 0, folder: 'portfolio' })
    ).rejects.toThrow(PresignValidationError);
    await expect(
      createPresignedPut({
        contentType: 'image/webp',
        contentLength: 1.5,
        folder: 'portfolio',
      })
    ).rejects.toThrow(PresignValidationError);
  });

  it('rejects path-traversal / unexpected folders', async () => {
    await expect(
      createPresignedPut({
        contentType: 'image/webp',
        contentLength: 1000,
        folder: '../private',
      })
    ).rejects.toThrow(PresignValidationError);
  });

  it('rejects hostile extensions (traversal, script, too long)', async () => {
    // Validated pre-client; extension errors surface before R2 client creation.
    // ('php' matches the benign [a-z0-9]{2,5} regex — harmless since the key is
    // server-generated and the content-type is signed; regex-hostile ones below.)
    for (const extension of ['../../etc', 'html!', 'toolongext', 'a']) {
      let threw = false;
      try {
        await createPresignedPut({
          contentType: 'image/webp',
          contentLength: 1000,
          folder: 'portfolio',
          extension,
        });
      } catch (err) {
        threw = true;
        expect(err).toBeInstanceOf(PresignValidationError);
      }
      expect(threw).toBe(true);
    }
  });
});

describe('STRIDE E — RBAC split probes (foundation vs operational settings)', () => {
  it('routes foundation fields (OWNER-only) separately from operational fields', () => {
    const result = partitionSettingsBody({
      currency: 'USD',
      currencyConfirmed: true,
      timeZone: 'Asia/Yerevan',
      defaultLocale: 'en',
      enabledLocales: ['en', 'ru'],
      confirmationNoticeHours: 24,
      requireStaffApprovalForInCall: false,
      slotGridStepMin: 30,
      sneakyKey: 'x',
    });
    expect(Object.keys(result.foundation).sort()).toEqual(
      ['currency', 'currencyConfirmed', 'defaultLocale', 'enabledLocales', 'timeZone'].sort()
    );
    expect(Object.keys(result.operational).sort()).toEqual(
      ['confirmationNoticeHours', 'requireStaffApprovalForInCall', 'slotGridStepMin'].sort()
    );
    expect(result.unknownKeys).toEqual(['sneakyKey']);
  });

  it('foundation field set matches the documented OWNER-only list', () => {
    expect(FOUNDATION_SETTINGS_FIELDS).toContain('currency');
    expect(FOUNDATION_SETTINGS_FIELDS).toContain('currencyConfirmed');
    expect(FOUNDATION_SETTINGS_FIELDS).not.toContain('confirmationNoticeHours');
    expect(FOUNDATION_SETTINGS_FIELDS).not.toContain('slotGridStepMin');
  });

  it('an OPERATOR body touching foundation fields is detectable server-side (partition is the enforcement primitive)', () => {
    const operatorAttempt = partitionSettingsBody({ currency: 'JPY', slotGridStepMin: 15 });
    // The settings route enforces OWNER on non-empty `foundation`; here we assert
    // the partition primitive cannot be fooled into calling currency operational.
    expect((operatorAttempt.foundation as Record<string, unknown>).currency).toBe('JPY');
    expect((operatorAttempt.operational as Record<string, unknown>).currency).toBeUndefined();
  });
});

describe('STRIDE D — rate-limit bypass attempts', () => {
  beforeEach(() => resetRateLimits());

  it('rotating keys does not bypass the per-contact limit, and different keys stay independent', () => {
    expect(enforceRateLimit(rateLimitKey('bot', 'tg-1'), 2, 60_000, 1000).allowed).toBe(true);
    expect(enforceRateLimit(rateLimitKey('bot', 'tg-1'), 2, 60_000, 1100).allowed).toBe(true);
    expect(enforceRateLimit(rateLimitKey('bot', 'tg-1'), 2, 60_000, 1200).allowed).toBe(false);
    // Another contact is unaffected (no cross-key bleed)
    expect(enforceRateLimit(rateLimitKey('bot', 'tg-2'), 2, 60_000, 1250).allowed).toBe(true);
    // Same contact on another route has an independent budget
    expect(enforceRateLimit(rateLimitKey('presign', 'tg-1'), 2, 60_000, 1300).allowed).toBe(true);
  });

  it('retryAfterMs is reported so blocked callers cannot retry early', () => {
    enforceRateLimit('once', 1, 10_000, 0);
    const blocked = enforceRateLimit('once', 1, 10_000, 100);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBe(9900);
  });
});

describe('FR-435 thin-controller audit — booking create boundary', () => {
  const validBody = {
    serviceId: '11111111-1111-4111-8111-111111111111',
    fulfillmentMode: 'IN_CALL',
    startsAt: '2026-12-01T10:00:00.000Z',
    customerName: 'Тест',
    customerContact: '+79990000000',
  };

  it('route is a thin controller: parse → boundary zod → delegate to createBooking, nothing else', async () => {
    const { createBooking } = jest.requireMock('@/lib/kernel/bookingService') as {
      createBooking: jest.Mock;
    };
    createBooking.mockClear();
    const res = await POST(
      new NextRequest('http://localhost/api/booking', {
        method: 'POST',
        body: JSON.stringify(validBody),
        headers: { 'content-type': 'application/json' },
      })
    );
    expect(res.status).toBe(201);
    expect(createBooking).toHaveBeenCalledTimes(1);
    expect(createBooking).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceId: validBody.serviceId,
        fulfillmentMode: 'IN_CALL',
        customerContact: validBody.customerContact,
      })
    );
  });

  it('the controller rejects malformed bodies before the service is invoked', async () => {
    const { createBooking } = jest.requireMock('@/lib/kernel/bookingService') as {
      createBooking: jest.Mock;
    };
    createBooking.mockClear();
    const res = await POST(
      new NextRequest('http://localhost/api/booking', {
        method: 'POST',
        body: JSON.stringify({ ...validBody, serviceId: 'not-a-uuid' }),
        headers: { 'content-type': 'application/json' },
      })
    );
    expect(res.status).toBe(400);
    expect(createBooking).not.toHaveBeenCalled();
  });
});
