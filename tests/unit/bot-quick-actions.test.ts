import { prisma } from '@/lib/db/prisma';

jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    userPreference: { findUnique: jest.fn(), upsert: jest.fn().mockResolvedValue({}) },
    shopSettings: { findUnique: jest.fn() },
    order: { findMany: jest.fn().mockResolvedValue([]) },
    bot: { api: { sendMessage: jest.fn() } },
  },
}));

jest.mock('@/lib/telemetry/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('@/lib/bot/telegramBot', () => ({
  bot: { api: { sendMessage: jest.fn() } },
  sendWithRetry: jest.fn(async (fn: () => Promise<unknown>) => fn()),
}));

jest.mock('@/lib/kernel/bookingService', () => ({
  cancelBooking: jest.fn(),
  CancellationError: class CancellationError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'CancellationError';
    }
  },
}));

import { cancelBooking, CancellationError } from '@/lib/kernel/bookingService';
import {
  cancelViaToken,
  resolveCallerLocale,
  setLanguageOverride,
} from '@/lib/bot/quickActions';
import { mainKeyboard } from '@/lib/bot/quickActions';

describe('Bot Quick Actions (T051, FR-416)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('locale resolution: override > language_code > instance default (FR-412)', async () => {
    (prisma.userPreference.findUnique as jest.Mock).mockResolvedValue({ languageOverride: 'ru' });
    (prisma.shopSettings.findUnique as jest.Mock).mockResolvedValue({ defaultLocale: 'en' });
    expect(await resolveCallerLocale('tg-1', 'en')).toBe('ru');

    (prisma.userPreference.findUnique as jest.Mock).mockResolvedValue(null);
    expect(await resolveCallerLocale('tg-1', 'ru-RU')).toBe('ru');

    (prisma.shopSettings.findUnique as jest.Mock).mockResolvedValue({ defaultLocale: 'ru' });
    expect(await resolveCallerLocale('tg-1', null)).toBe('ru');
  });

  it('my bookings: reply includes order lines; empty list shows noBookings message', async () => {
    const reply = jest.fn(async () => null);
    (prisma.userPreference.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.shopSettings.findUnique as jest.Mock).mockResolvedValue({ defaultLocale: 'en' });

    (prisma.order.findMany as jest.Mock).mockResolvedValueOnce([
      {
        orderNumber: 'ORD-1',
        status: 'PAID',
        reservation: { startTime: new Date('2026-11-01T10:00:00Z') },
        items: [{ titleSnapshot: 'Haircut' }],
      },
    ]);
    const { showMyBookings } = await import('@/lib/bot/quickActions');
    await showMyBookings({ from: { id: 1, language_code: 'en' }, reply });
    expect(reply.mock.calls[0][0]).toContain('Haircut');

    (prisma.order.findMany as jest.Mock).mockResolvedValueOnce([]);
    await showMyBookings({ from: { id: 1, language_code: 'en' }, reply });
    expect(reply.mock.calls[1][0]).toContain('no active bookings');
  });

  it('cancel via token: success and CancellationError paths', async () => {
    (cancelBooking as jest.Mock).mockResolvedValueOnce(undefined);
    const ok = await cancelViaToken('tg-1', ['res-1', 'valid-token-value-16ch']);
    expect(ok.ok).toBe(true);
    expect(cancelBooking).toHaveBeenCalledWith(
      expect.objectContaining({ bookingId: 'res-1', token: 'valid-token-value-16ch' })
    );

    (cancelBooking as jest.Mock).mockRejectedValueOnce(
      new CancellationError('invalid token')
    );
    const bad = await cancelViaToken('tg-1', ['res-1', 'wrong-token-value-16']);
    expect(bad.ok).toBe(false);
    expect(bad.message).toContain('Could not cancel');

    const usage = await cancelViaToken('tg-1', ['res-1']);
    expect(usage.ok).toBe(false);
  });

  it('language switch persists UserPreference override', async () => {
    await setLanguageOverride('tg-9', 'ru');
    expect(prisma.userPreference.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tgId: 'tg-9' }, update: { languageOverride: 'ru' } })
    );
  });

  it('main keyboard exposes all four quick actions in ≤3 taps (FR-416)', () => {
    const kb = mainKeyboard();
    const rendered = JSON.stringify(kb);
    expect(rendered).toContain('qb:bookings');
    expect(rendered).toContain('qb:lang');
    expect(rendered).toContain('contact_manager');
  });
});
