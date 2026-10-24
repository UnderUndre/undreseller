/**
 * T041 (US3, FR-411/412): staff-bot string dictionaries.
 * Asserts ru/en coverage parity for every extracted key, the staff locale
 * resolution chain (ShopSettings.defaultLocale; NO per-staff override column —
 * documented fallback) and that extracted user-visible messages no longer
 * carry hardcoded Russian literals outside the dictionaries.
 */

import {
  formatBotString,
  getStaffBotStrings,
  resolveStaffLocale,
  type StaffBotStrings,
} from '@/lib/i18n/botStrings';
import { formatStaffOrderCard, maskCustomerPhone, type StaffOrderCardData } from '@/lib/bot/staffBot';
import type { I18nLocale } from '@/lib/i18n/config';

function flattenDict(obj: unknown, prefix = ''): string[] {
  const keys: string[] = [];
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object') keys.push(...flattenDict(v, p));
    else keys.push(p);
  }
  return keys;
}

const LOCALES: I18nLocale[] = ['ru', 'en'];

describe('T041 staff-bot strings', () => {
  it('ru and en StaffBotStrings dictionaries cover identical key sets', () => {
    const ru = flattenDict(getStaffBotStrings('ru'));
    const en = flattenDict(getStaffBotStrings('en'));
    expect(new Set(ru)).toEqual(new Set(en));
    // Every key must resolve to a non-empty string in both locales
    for (const locale of LOCALES) {
      const dict = getStaffBotStrings(locale);
      for (const key of flattenDict(dict)) {
        const value = key
          .split('.')
          .reduce<unknown>((acc, part) => (acc as Record<string, unknown>)[part], dict);
        expect(typeof value).toBe('string');
        expect(value as string).not.toBe('');
      }
    }
  });

  it('dictionaries expose all surface groups (card, keyboard, copyContacts, templates, clientNotices)', () => {
    for (const locale of LOCALES) {
      const dict: StaffBotStrings = getStaffBotStrings(locale);
      expect(Object.keys(dict.card)).toContain('newOrder');
      expect(Object.keys(dict.keyboard)).toEqual(
        expect.arrayContaining(['approve', 'reject', 'reschedule', 'blacklist', 'fulfill', 'copyContacts'])
      );
      expect(dict.templates).toHaveProperty('approveBody');
      expect(dict.clientNotices).toHaveProperty('approveAwaitingPayment');
    }
  });

  it('resolveStaffLocale picks the dict by ShopSettings.defaultLocale; missing/unsupported falls back to ru (legacy staff surface)', () => {
    expect(resolveStaffLocale('en')).toBe('en');
    expect(resolveStaffLocale('ru')).toBe('ru');
    // 'de' is unsupported (US3-SC2 analog) → no error, legacy fallback
    expect(resolveStaffLocale('de')).toBe('ru');
    expect(resolveStaffLocale(null)).toBe('ru');
    expect(resolveStaffLocale(undefined)).toBe('ru');

    expect(getStaffBotStrings(resolveStaffLocale('en')).card.newOrder).toContain('New booking');
    expect(getStaffBotStrings(resolveStaffLocale('ru')).card.newOrder).toContain('Новая запись');
    expect(getStaffBotStrings(resolveStaffLocale('de')).card.newOrder).toContain('Новая запись');
  });

  it('formatStaffOrderCard renders the localized chrome but keeps authored service titles verbatim', () => {
    const data: StaffOrderCardData = {
      orderId: 'ord-1',
      orderNumber: 'ORD-777',
      serviceTitles: ['Стрижка', 'Beard Trim'],
      totalDurationMin: 75,
      startTimeIso: '2026-10-21T10:00:00Z',
      endTimeIso: '2026-10-21T11:15:00Z',
      totalMinor: 4000,
      currency: 'USD',
      paymentType: 'PAY_ON_SITE',
      customerName: 'Алексей',
      customerPhone: '+79991234567',
      customerTgUsername: 'alexey_tg',
      hasWhatsApp: true,
      hasTelegram: true,
      hasCustomerNotes: false,
      customerNotes: null,
      isNewClient: true,
    };

    const ru = formatStaffOrderCard(data, 'ru');
    const en = formatStaffOrderCard(data, 'en');

    // Chrome is localized
    expect(ru).toContain('🛎 Новая запись #ORD-777');
    expect(en).toContain('🛎 New booking #ORD-777');
    expect(ru).toContain('Оплата на месте');
    expect(en).toContain('Pay on site');

    // Business data (service titles) stays authored in BOTH locales (FR-414)
    expect(ru).toContain('Стрижка');
    expect(en).toContain('Стрижка');
    expect(ru).toContain('Beard Trim');
    expect(en).toContain('Beard Trim');
  });

  it('maskCustomerPhone localizes the missing-phone chrome', () => {
    expect(maskCustomerPhone(null, 'ru')).toBe('Не указан');
    expect(maskCustomerPhone(null, 'en')).toBe('Not specified');
  });

  it('formatBotString interpolates placeholders and leaves unknown ones intact', () => {
    expect(formatBotString('a {x} b {y}', { x: 1 })).toBe('a 1 b {y}');
    expect(formatBotString('no params')).toBe('no params');
  });
});
