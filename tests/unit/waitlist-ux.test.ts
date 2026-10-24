/**
 * Waitlist UX unit tests (T072, US5, FR-419/422):
 * - join route: zod validation + reason→HTTP status mapping + Telegram-only gate
 * - stats route: zero-filled aggregation by offer/entry status
 */

jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    item: { findFirst: jest.fn() },
    waitlistEntry: {
      count: jest.fn().mockResolvedValue(0),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'entry-new' }),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
      groupBy: jest.fn(),
    },
    waitlistOffer: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 'offer-1' }),
      findUnique: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      groupBy: jest.fn(),
    },
  },
}));

jest.mock('@/lib/security/initData', () => ({
  verifyTelegramInitData: jest.fn(),
}));

jest.mock('@/lib/telemetry/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { verifyTelegramInitData } from '@/lib/security/initData';
import { POST, joinFailurePayload } from '@/app/api/waitlist/join/route';
import { GET as statsGET } from '@/app/api/waitlist/stats/route';

const VALID_WINDOW = {
  windowStartAt: new Date('2026-11-01T00:00:00.000Z').toISOString(),
  windowEndAt: new Date('2026-11-01T23:59:59.000Z').toISOString(),
};

function joinRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/waitlist/join', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('Waitlist join route (T072, FR-419)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (verifyTelegramInitData as jest.Mock).mockReset();
  });

  it('maps failure reasons to HTTP statuses', () => {
    expect(joinFailurePayload('TOO_MANY_ACTIVE').status).toBe(429);
    expect(joinFailurePayload('DUPLICATE_ACTIVE').status).toBe(409);
    expect(joinFailurePayload('WINDOW_TOO_LONG').status).toBe(400);
    expect(joinFailurePayload('ITEM_NOT_FOUND').status).toBe(404);
    expect(joinFailurePayload('TELEGRAM_REQUIRED').status).toBe(400);
    expect(joinFailurePayload('UNAUTHORIZED_INIT_DATA').status).toBe(401);
    expect(joinFailurePayload('VALIDATION').status).toBe(400);
    // No silent dead-end: guidance text always present (FR-419)
    for (const reason of [
      'TOO_MANY_ACTIVE',
      'DUPLICATE_ACTIVE',
      'WINDOW_TOO_LONG',
      'ITEM_NOT_FOUND',
      'TELEGRAM_REQUIRED',
      'UNAUTHORIZED_INIT_DATA',
      'VALIDATION',
    ] as const) {
      expect(joinFailurePayload(reason).error.length).toBeGreaterThan(10);
    }
  });

  it('rejects invalid payloads with VALIDATION', async () => {
    const res = await POST(joinRequest({ windowStartAt: 'not-a-date', windowEndAt: VALID_WINDOW.windowEndAt }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.reason).toBe('VALIDATION');
  });

  it('rejects contact-only join with Telegram guidance (FR-419)', async () => {
    const res = await POST(
      joinRequest({ serviceId: 'svc-1', contact: '+123456', ...VALID_WINDOW })
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.reason).toBe('TELEGRAM_REQUIRED');
    expect(data.error).toMatch(/telegram/i);
  });

  it('rejects invalid initData HMAC', async () => {
    (verifyTelegramInitData as jest.Mock).mockReturnValue({ valid: false, error: 'bad hmac' });
    const res = await POST(
      joinRequest({ serviceId: 'svc-1', ...VALID_WINDOW, initData: 'forged' })
    );
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.reason).toBe('UNAUTHORIZED_INIT_DATA');
  });

  it('joins with valid initData and maps service failures', async () => {
    (verifyTelegramInitData as jest.Mock).mockReturnValue({
      valid: true,
      telegramUserId: '7770001',
    });
    (prisma.item.findFirst as jest.Mock).mockResolvedValue({ id: 'svc-1' });

    const ok = await POST(
      joinRequest({ serviceId: 'svc-1', contact: '@user', ...VALID_WINDOW, initData: 'sig' })
    );
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ ok: true, entryId: 'entry-new' });
    expect(prisma.waitlistEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ customerTgId: '7770001', serviceId: 'svc-1' }),
      })
    );

    // Service-level failure surfaces with mapped status
    (prisma.waitlistEntry.count as jest.Mock).mockResolvedValue(10);
    const capped = await POST(
      joinRequest({ serviceId: 'svc-1', ...VALID_WINDOW, initData: 'sig' })
    );
    expect(capped.status).toBe(429);
    expect((await capped.json()).reason).toBe('TOO_MANY_ACTIVE');
  });
});

describe('Waitlist stats route (T072, FR-422)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('requires staff auth', async () => {
    // authenticateStaff is not mocked: unauthenticated NextRequest → 401 path
    const req = new NextRequest('http://localhost/api/waitlist/stats');
    const res = await statsGET(req);
    expect(res.status).toBe(401);
  });

  it('aggregates offer/entry counts zero-filled (mocked staff auth via header-less env)', async () => {
    // Staff auth depends on env/session; simulate the aggregation logic through
    // the same zero-fill contract by exercising prisma.groupBy mocks via a
    // direct call path: authenticateStaff with a valid Bearer token env.
    const original = process.env.ADMIN_TOKEN;
    process.env.ADMIN_TOKEN = 'stats-test-token';
    try {
      (prisma.waitlistOffer.groupBy as jest.Mock).mockResolvedValue([
        { status: 'CLAIMED', _count: { _all: 4 } },
        { status: 'EXPIRED', _count: { _all: 9 } },
      ]);
      (prisma.waitlistEntry.groupBy as jest.Mock).mockResolvedValue([
        { status: 'ACTIVE', _count: { _all: 3 } },
      ]);

      const req = new NextRequest('http://localhost/api/waitlist/stats', {
        headers: { authorization: 'Bearer stats-test-token' },
      });
      const res = await statsGET(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.offers).toEqual({ SENT: 0, CLAIMED: 4, TAKEN: 0, EXPIRED: 9 });
      expect(data.entries.ACTIVE).toBe(3);
      expect(data.entries.FULFILLED).toBe(0);
      expect(data.recoveredSlots).toBe(4);
      expect(data.offersSent).toBe(13);
    } finally {
      if (original === undefined) delete process.env.ADMIN_TOKEN;
      else process.env.ADMIN_TOKEN = original;
    }
  });
});
