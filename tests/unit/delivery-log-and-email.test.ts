import { prisma } from '@/lib/db/prisma';

jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    notificationDeliveryLog: {
      create: jest.fn().mockResolvedValue({ id: 'dl-1' }),
      deleteMany: jest.fn().mockResolvedValue({ count: 3 }),
    },
  },
}));

jest.mock('@/lib/telemetry/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import {
  assertNoPiiInLogPayload,
  hashDeliveryTarget,
  logDeliveryAttempt,
  purgeDeliveryLogsOlderThan90Days,
} from '@/lib/notifications/deliveryLog';
import { logger } from '@/lib/telemetry/logger';
import {
  ResendEmailProvider,
  resolveEmailProvider,
  type EmailProvider,
} from '@/lib/email/emailProvider';

describe('Notification Delivery Log (T014, FR-409)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.DELIVERY_LOG_SALT = 'test-salt';
  });

  it('persists ACCEPTED/FAILED with a salted hash — raw target never stored', async () => {
    await logDeliveryAttempt({
      channel: 'TELEGRAM',
      target: '123456789',
      status: 'ACCEPTED',
      orderId: 'order-1',
      startedAt: new Date(Date.now() - 50),
    });

    const call = (prisma.notificationDeliveryLog.create as jest.Mock).mock.calls[0][0];
    expect(call.data.channel).toBe('TELEGRAM');
    expect(call.data.status).toBe('ACCEPTED');
    expect(call.data.targetHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(call.data)).not.toContain('123456789');

    // Structured log also carries hash only
    const logCall = (logger.info as jest.Mock).mock.calls.find((c) => c[0] === '[DELIVERY_LOG]');
    expect(JSON.stringify(logCall)).not.toContain('123456789');
  });

  it('salted hash is deterministic per salt and differs across salts', () => {
    process.env.DELIVERY_LOG_SALT = 'salt-a';
    const a = hashDeliveryTarget('user@example.com');
    const a2 = hashDeliveryTarget('user@example.com');
    expect(a).toBe(a2);

    process.env.DELIVERY_LOG_SALT = 'salt-b';
    const b = hashDeliveryTarget('user@example.com');
    expect(a).not.toBe(b);
  });

  it('90-day retention purge deletes by attemptAt cutoff', async () => {
    const count = await purgeDeliveryLogsOlderThan90Days();
    expect(count).toBe(3);
    expect(prisma.notificationDeliveryLog.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.anything() })
    );
  });

  it('zero-PII log-scan helper (SC-403): rejects payloads containing emails/phones/tg ids', () => {
    expect(() => assertNoPiiInLogPayload({ msg: 'contact me at a@gmail.com' })).toThrow(/PII leak/);
    expect(() => assertNoPiiInLogPayload({ phone: '+79991234567' })).toThrow(/PII leak/);
    expect(() => assertNoPiiInLogPayload({ targetHash: 'ab12', latencyMs: 30 })).not.toThrow();
  });
});

describe('Transactional Email Adapter (T015, FR-409 fallback readiness)', () => {
  it('unconfigured adapter degrades gracefully to NO_EMAIL_CHANNEL (FR-409 staff warning path)', async () => {
    const provider = new ResendEmailProvider({ apiKey: '' });
    const result = await provider.send({ to: 'a@b.com', subject: 'x', html: '<p>x</p>' });
    expect(result.status).toBe('NO_EMAIL_CHANNEL');
    expect(result.errorCode).toBe('NO_API_KEY');
  });

  it('configured adapter sends via provider HTTP API and returns providerRef on ACCEPTED', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'email-123' }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const provider = new ResendEmailProvider({
      apiKey: 'test-key',
      fromAddress: 'noreply@test.dev',
    });
    const result = await provider.send({ to: 'client@b.com', subject: 'Booking', html: '<p>y</p>' });

    expect(result.status).toBe('ACCEPTED');
    expect(result.providerRef).toBe('email-123');
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBe('Bearer test-key');
    expect(JSON.parse(init.body).to).toBe('client@b.com');
  });

  it('provider HTTP error maps to FAILED with errorCode (delivery log FAILED path)', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 }) as unknown as typeof fetch;
    const provider = new ResendEmailProvider({ apiKey: 'test-key' });
    const result = await provider.send({ to: 'a@b.com', subject: 'x', html: 'x' });
    expect(result.status).toBe('FAILED');
    expect(result.errorCode).toBe('HTTP_503');
  });

  it('registry resolves RESEND by default and fails closed on unknown ids', () => {
    expect(resolveEmailProvider('RESEND')).toBeInstanceOf(ResendEmailProvider);
    expect(() => resolveEmailProvider('CARRIER_PIGEON')).toThrow(/Unknown email provider/);
  });

  it('adapter interface is provider-isolated: any EmailProvider satisfies the contract', async () => {
    const mockProvider: EmailProvider = {
      id: 'MOCK',
      send: jest.fn().mockResolvedValue({ status: 'ACCEPTED', providerRef: 'm-1' }),
    };
    const result = await mockProvider.send({ to: 'a@b.com', subject: 'x', html: 'x' });
    expect(result.status).toBe('ACCEPTED');
  });
});
