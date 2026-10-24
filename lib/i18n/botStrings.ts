/**
 * Bot string dictionaries (T041/T051): minimal per-locale strings for the
 * client-bot quick actions. Full chrome i18n rides the shared next-intl
 * messages; bot surfaces use these typed dictionaries (grammY has no RSC).
 */

import type { I18nLocale } from './config';

export interface ClientBotStrings {
  myBookings: string;
  noBookings: string;
  noTime: string;
  langSet: string;
  cancelUsage: string;
}

const STRINGS: Record<I18nLocale, ClientBotStrings> = {
  en: {
    myBookings: '📋 Your bookings:',
    noBookings: 'You have no active bookings yet. Open the storefront to book!',
    noTime: 'time to be confirmed',
    langSet: '✅ Language set to English.',
    cancelUsage: 'Usage: /cancel <bookingId> <token> — the token was issued when you booked.',
  },
  ru: {
    myBookings: '📋 Ваши записи:',
    noBookings: 'У вас пока нет активных записей. Откройте витрину, чтобы записаться!',
    noTime: 'время уточняется',
    langSet: '✅ Язык переключён на русский.',
    cancelUsage: 'Использование: /cancel <bookingId> <token> — токен был выдан при записи.',
  },
};

export function getPublicBotStrings(locale: I18nLocale): ClientBotStrings {
  return STRINGS[locale];
}
