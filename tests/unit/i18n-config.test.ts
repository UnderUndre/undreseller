import {
  I18N_DEFAULT_LOCALE,
  I18N_LOCALES,
  NEXT_LOCALE_COOKIE,
  normalizeLocale,
  resolveLocale,
} from '@/lib/i18n/config';

describe('i18n Locale Resolution Chain (T012, FR-412)', () => {
  it('resolution order: user override > language_code > cookie > instance default > en', () => {
    expect(resolveLocale({ override: 'ru', languageCode: 'en', cookieLocale: 'en' })).toBe('ru');
    expect(resolveLocale({ languageCode: 'ru', cookieLocale: 'en' })).toBe('ru');
    expect(resolveLocale({ cookieLocale: 'ru', instanceDefault: 'en' })).toBe('ru');
    expect(resolveLocale({ instanceDefault: 'ru' })).toBe('ru');
    expect(resolveLocale({})).toBe(I18N_DEFAULT_LOCALE);
  });

  it('unsupported codes fall through the chain (de → next candidate, US3 scenarios)', () => {
    expect(resolveLocale({ override: 'de', languageCode: 'ru' })).toBe('ru');
    expect(resolveLocale({ languageCode: 'de', cookieLocale: 'ru' })).toBe('ru');
    expect(resolveLocale({ override: 'de' })).toBe('en');
  });

  it('BCP-47 prefixes normalize: ru-RU → ru, en-US → en', () => {
    expect(normalizeLocale('ru-RU')).toBe('ru');
    expect(normalizeLocale('en-US')).toBe('en');
  });

  it('ru/en are the release locales; locale list is data-extensible (uk post-launch)', () => {
    expect([...I18N_LOCALES]).toEqual(['ru', 'en']);
  });

  it('NEXT_LOCALE_COOKIE is the anonymous-web fallback cookie name (T043 contract)', () => {
    expect(NEXT_LOCALE_COOKIE).toBe('NEXT_LOCALE');
  });
});
