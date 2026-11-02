import { GET as whatsappGet } from '@/lib/../app/api/bot/whatsapp/webhook/route';
import { PATCH as adminBookingPatch } from '@/lib/../app/api/admin/bookings/[id]/route';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { authenticateStaff, emitAuditEvent } from '@/lib/security/staffAuth';
import { sendWhatsAppTemplate } from '@/lib/bot/whatsappClient';

jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    slotReservation: { findFirst: jest.fn(), update: jest.fn() },
    order: { update: jest.fn() },
    $transaction: jest.fn(),
  },
}));

jest.mock('@/lib/security/staffAuth', () => ({
  authenticateStaff: jest.fn(),
  emitAuditEvent: jest.fn(),
}));

jest.mock('@/lib/telemetry/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    counter: jest.fn(),
  },
}));

const mockedAuth = authenticateStaff as jest.Mock;
const mockedEmitAudit = emitAuditEvent as jest.Mock;
const mockedPrisma = prisma as unknown as {
  slotReservation: { findFirst: jest.Mock; update: jest.Mock };
  order: { update: jest.Mock };
  $transaction: jest.Mock;
};

describe('007 Fixes: FR-703 Admin bookings RESCHEDULE -> 501', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedAuth.mockResolvedValue({
      authenticated: true,
      actor: { actorId: 'admin-1', actorRole: 'OWNER' },
    });
    mockedPrisma.slotReservation.findFirst.mockResolvedValue({
      id: 'res-1',
      orderId: 'ord-1',
      resourceId: 'res-id',
    });
  });

  it('returns 501 with diagnostics and makes 0 DB mutations and 0 AuditEvents', async () => {
    const req = new NextRequest('http://localhost:3000/api/admin/bookings/res-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'RESCHEDULE' }),
    });

    const res = await adminBookingPatch(req, { params: Promise.resolve({ id: 'res-1' }) });

    expect(res.status).toBe(501);
    const json = await res.json();
    expect(json.error).toContain('RESCHEDULE is not implemented');
    expect(mockedPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockedPrisma.slotReservation.update).not.toHaveBeenCalled();
    expect(mockedPrisma.order.update).not.toHaveBeenCalled();
    expect(mockedEmitAudit).not.toHaveBeenCalled();
  });
});

describe('007 Fixes: FR-707 WhatsApp verify timing-safe byteLength guard', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.WHATSAPP_VERIFY_TOKEN = 'secret-token-123';
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('returns 200 + challenge when verify_token matches exactly', async () => {
    const req = new NextRequest(
      'http://localhost:3000/api/bot/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=secret-token-123&hub.challenge=CHALLENGE_ACCEPTED'
    );
    const res = await whatsappGet(req);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toBe('CHALLENGE_ACCEPTED');
  });

  it('returns 403 when verify_token differs in length or content', async () => {
    const req = new NextRequest(
      'http://localhost:3000/api/bot/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=CHALLENGE'
    );
    const res = await whatsappGet(req);
    expect(res.status).toBe(403);
  });

  it('returns 403 and never throws RangeError on multi-byte UTF-8 token mismatch', async () => {
    // 16 multi-byte chars vs 16 ASCII chars: string length is equal, but buffer byte lengths differ!
    const multiByteToken = 'тест-токен-12345';
    const req = new NextRequest(
      `http://localhost:3000/api/bot/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(
        multiByteToken
      )}&hub.challenge=CHALLENGE`
    );
    const res = await whatsappGet(req);
    expect(res.status).toBe(403);
  });
});

describe('007 Fixes: FR-705 WhatsApp fetch timeout aborts retries', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.WHATSAPP_ACCESS_TOKEN = 'wa-token';
    process.env.WHATSAPP_PHONE_NUMBER_ID = 'phone-id';
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('immediately returns success: false without repeating 3 times when fetch throws AbortError', async () => {
    let fetchCalls = 0;
    global.fetch = jest.fn().mockImplementation(() => {
      fetchCalls++;
      const abortErr = new Error('The operation was aborted due to timeout');
      abortErr.name = 'AbortError';
      return Promise.reject(abortErr);
    });

    const res = await sendWhatsAppTemplate({
      toPhone: '+79991234567',
      templateName: 'appointment_confirmation',
    });

    expect(res).toEqual({ success: false });
    // Retries must NOT continue across 3 attempts on timeout
    expect(fetchCalls).toBe(1);
  });
});
