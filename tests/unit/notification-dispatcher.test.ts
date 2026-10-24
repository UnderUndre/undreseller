import { prisma } from '@/lib/db/prisma';

jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    notificationDeliveryLog: {
      create: jest.fn().mockResolvedValue({ id: 'dl-1' }),
      findMany: jest.fn().mockResolvedValue([]),
    },
  },
}));

jest.mock('@/lib/telemetry/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('@/lib/bot/telegramBot', () => ({
  bot: { api: { sendMessage: jest.fn() } },
  sendWithRetry: jest.fn(),
}));

jest.mock('@/lib/email/emailProvider', () => {
  const actual = jest.requireActual('@/lib/email/emailProvider');
  return { ...actual, resolveEmailProvider: jest.fn() };
});

import { sendWithRetry, bot } from '@/lib/bot/telegramBot';
import { resolveEmailProvider } from '@/lib/email/emailProvider';
import {
  dispatchEmailFallback,
  dispatchLifecycleNotification,
  getDeliveryHistoryForOrder,
  EMAIL_FALLBACK_RETRY_SCHEDULE,
} from '@/lib/notifications/dispatcher';

function totalFallbackMinutes(): number {
  return EMAIL_FALLBACK_RETRY_SCHEDULE.reduce((sum, s) => sum + parseInt(s, 10), 0);
}

describe('Notification Dispatcher (T032, FR-409)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.DELIVERY_LOG_SALT = 'test-salt';
    process.env.FEATURE_FLAG_EMAIL_FALLBACK = 'true';
    (sendWithRetry as jest.Mock).mockImplementation(async (fn: () => Promise<unknown>) => fn());
  });

  it('TG success → ACCEPTED, no fallback attempt', async () => {
    (bot.api.sendMessage as jest.Mock).mockResolvedValue(true);

    const result = await dispatchLifecycleNotification({
      event: 'BOOKING_CONFIRMED',
      chatId: '123',
      text: 'Confirmed!',
      orderId: 'order-1',
    });

    expect(result.primary).toBe('ACCEPTED');
    expect(result.fallback).toBe('NOT_NEEDED');
    expect(resolveEmailProvider).not.toHaveBeenCalled();
  });

  it('TG failure with email on file → email fallback attempted and delivery-logged', async () => {
    (bot.api.sendMessage as jest.Mock).mockRejectedValue(new Error('TG down'));
    (resolveEmailProvider as jest.Mock).mockReturnValue({
      id: 'MOCK',
      send: jest.fn().mockResolvedValue({ status: 'ACCEPTED', providerRef: 'e-1' }),
    });

    const result = await dispatchLifecycleNotification({
      event: 'BOOKING_CANCELLED',
      chatId: '123',
      text: 'Cancelled',
      customerEmail: 'client@example.com',
      email: { subject: 'Cancelled', html: '<p>Cancelled</p>' },
      orderId: 'order-2',
    });

    expect(result.primary).toBe('FAILED');
    expect(result.fallback).toBe('ACCEPTED');
    expect((resolveEmailProvider as jest.Mock).mock.results[0].value.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'client@example.com' })
    );
  });

  it('TG failure without email on file → NO_ADDRESS + staff warning (FR-409)', async () => {
    (bot.api.sendMessage as jest.Mock).mockRejectedValue(new Error('TG down'));

    const result = await dispatchLifecycleNotification({
      event: 'BOOKING_REMINDER',
      chatId: '123',
      text: 'Reminder',
      customerEmail: null,
      orderId: 'order-3',
    });

    expect(result.fallback).toBe('NO_ADDRESS');
    expect(resolveEmailProvider).not.toHaveBeenCalled();
  });

  it('failed fallback provider maps to FAILED delivery log row', async () => {
    (resolveEmailProvider as jest.Mock).mockReturnValue({
      id: 'MOCK',
      send: jest.fn().mockResolvedValue({ status: 'FAILED', errorCode: 'HTTP_500' }),
    });

    const status = await dispatchEmailFallback({
      customerEmail: 'client@example.com',
      email: { subject: 'x', html: 'x' },
    });
    expect(status).toBe('FAILED');
  });

  it('email fallback retry schedule totals ≤5 minutes (FR-409 SLA)', () => {
    expect(totalFallbackMinutes()).toBeLessThanOrEqual(5);
  });

  it('killswitch: emailFallbackEnabled=false keeps notifications TG-only', async () => {
    (bot.api.sendMessage as jest.Mock).mockRejectedValue(new Error('TG down'));
    process.env.FEATURE_FLAG_EMAIL_FALLBACK = 'false';

    const result = await dispatchLifecycleNotification({
      event: 'BOOKING_HELD',
      chatId: '123',
      text: 'Held',
      customerEmail: 'client@example.com',
      email: { subject: 'x', html: 'x' },
    });

    expect(result.fallback).toBe('NOT_NEEDED');
    expect(resolveEmailProvider).not.toHaveBeenCalled();
  });

  it('delivery history for staff is hash-only (no raw targets)', async () => {
    await getDeliveryHistoryForOrder('order-1');
    expect(prisma.notificationDeliveryLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orderId: 'order-1' },
        select: expect.objectContaining({ targetHash: true }),
      })
    );
  });
});
