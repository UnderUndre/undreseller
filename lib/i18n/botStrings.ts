/**
 * Bot string dictionaries (T041/T051): minimal per-locale strings for the
 * client-bot quick actions. Full chrome i18n rides the shared next-intl
 * messages; bot surfaces use these typed dictionaries (grammY has no RSC).
 */

import { isSupportedLocale, type I18nLocale } from './config';

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
/**
 * Staff-bot strings (T041, FR-411/412): order pager cards, action keyboard,
 * copy-contacts texts, customer message templates and client notices.
 *
 * Locale resolution (FR-412-equivalent chain for the staff surface):
 *   staff locale = ShopSettings.defaultLocale (resolveStaffLocale) — there is
 *   NO per-staff locale override column in the schema (documented decision:
 *   staff is a single-owner surface; a per-staff override would need a
 *   migration and is out of scope for 004). Unknown/missing values fall back
 *   to the built-in default via resolveLocale.
 */
export interface StaffBotStrings {
  phoneNotSpecified: string;
  card: {
    newOrder: string;
    client: string;
    newClient: string;
    returningClient: string;
    guest: string;
    phone: string;
    whatsapp: string;
    telegram: string;
    telegramNoUsername: string;
    services: string;
    time: string;
    total: string;
    payOnSite: string;
    prepaymentOnline: string;
    notesWithText: string;
    notesNone: string;
    contactsCopyHeader: string;
  };
  keyboard: {
    approve: string;
    reject: string;
    reschedule: string;
    blacklist: string;
    fulfill: string;
    copyContacts: string;
  };
  copyContacts: {
    header: string;
    name: string;
    phone: string;
    whatsapp: string;
    telegram: string;
    telegramNoUsername: string;
  };
  templates: {
    greetingFallback: string;
    services: string;
    duration: string;
    approveBody: string;
    approveFooter: string;
    waitAtTime: string;
    rejectBody: string;
    rejectFooter: string;
    rescheduleIntro: string;
    rescheduleLink: string;
    rescheduleNoLink: string;
    reschedulePlaceholder: string;
    blacklistIntro: string;
    blacklistReason: string;
    fulfillIntro: string;
    fulfillFooter: string;
  };
  clientNotices: {
    approveAwaitingPayment: string;
    approveConfirmed: string;
    rejected: string;
    blacklisted: string;
    rescheduleOffered: string;
  };
}

/** Legacy staff-surface fallback (T041): pre-i18n staff surfaces were Russian-only. */
const STAFF_FALLBACK_LOCALE: I18nLocale = 'ru';

const STAFF_STRINGS: Record<I18nLocale, StaffBotStrings> = {
  ru: {
    phoneNotSpecified: 'Не указан',
    card: {
      newOrder: '🛎 Новая запись #{orderNumber}',
      client: '👤 Клиент: {name} ({segment})',
      newClient: '🆕 Новый клиент',
      returningClient: '⭐ Постоянный клиент',
      guest: 'Гость',
      phone: '📞 Телефон: {phone}',
      whatsapp: '💬 WhatsApp: есть (по указанному номеру)',
      telegram: '📱 Telegram: @{username}',
      telegramNoUsername: '📱 Telegram: есть (юзернейм не указан)',
      services: '🧰 Услуги ({minutes} мин):\n{list}',
      time: '🕒 Время: {start} — {end}',
      total: '💰 Сумма: {price} {payment}',
      payOnSite: '💵 Оплата на месте',
      prepaymentOnline: '💳 Онлайн-предоплата',
      notesWithText: '📝 Примечание: {notes}',
      notesNone: '📝 Примечание: нет',
      contactsCopyHeader: '📋 Контакты для копирования в WhatsApp/Telegram:',
    },
    keyboard: {
      approve: '✅ Принять',
      reject: '❌ Отклонить',
      reschedule: '🔄 Перенести',
      blacklist: '🚫 В чёрный список',
      fulfill: '✅ Заказ выполнен',
      copyContacts: '📋 Копировать контакты',
    },
    copyContacts: {
      header: 'Контакты клиента · заказ #{orderNumber}',
      name: 'Имя: {name}',
      phone: 'Телефон: {phone}',
      whatsapp: 'WhatsApp: есть ({phone})',
      telegram: 'Telegram: @{username}',
      telegramNoUsername: 'Telegram: есть (юзернейм не указан)',
    },
    templates: {
      greetingFallback: 'Здравствуйте',
      services: 'Услуги: {services}.',
      duration: 'Длительность: {minutes} мин.',
      approveBody: '{name}, ваша запись #{orderNumber} подтверждена! ✅',
      approveFooter: 'Оплата — на месте. Если планы изменятся, напишите нам заранее.',
      waitAtTime: 'Ждём вас в назначенное время.',
      rejectBody: '{name}, к сожалению, запись #{orderNumber} не может быть принята. ❌',
      rejectFooter: 'Напишите нам — подберём другое удобное время.',
      rescheduleIntro: '{name}, запись #{orderNumber} нужно перенести. 🔄',
      rescheduleLink: 'Выберите новое удобное время по одноразовой ссылке: {url}',
      rescheduleNoLink: 'Напишите нам — подберём новое удобное время.',
      reschedulePlaceholder: '✏️ Мастер добавит сюда день и время переноса.',
      blacklistIntro: '{name}, запись #{orderNumber} аннулирована.',
      blacklistReason:
        'Причина: нарушение правил сервиса (фиксированный прайс, запросы скидок/торга не рассматриваются). Доступ к онлайн-записи ограничен.',
      fulfillIntro: '{name}, спасибо за визит! ✅ Заказ #{orderNumber} выполнен.',
      fulfillFooter: 'Будем рады видеть вас снова.',
    },
    clientNotices: {
      approveAwaitingPayment:
        '✅ Мастер подтвердил вашу запись #{orderNumber}! Пожалуйста, оплатите счёт в течение 15 минут.',
      approveConfirmed: '✅ Ваша запись #{orderNumber} подтверждена мастером! Ждём вас.',
      rejected: '❌ К сожалению, запись #{orderNumber} была отклонена мастером.',
      blacklisted:
        'Ваша запись аннулирована в связи с нарушением правил сервиса (запрос скидки/торга при фиксированном прайсе). Доступ к онлайн-записи ограничен',
      rescheduleOffered:
        '🔄 Мастер предложил перенести запись #{orderNumber}. Выберите новое удобное время по одноразовой ссылке: {url}',
    },
  },
  en: {
    phoneNotSpecified: 'Not specified',
    card: {
      newOrder: '🛎 New booking #{orderNumber}',
      client: '👤 Client: {name} ({segment})',
      newClient: '🆕 New client',
      returningClient: '⭐ Returning client',
      guest: 'Guest',
      phone: '📞 Phone: {phone}',
      whatsapp: '💬 WhatsApp: yes (at the number provided)',
      telegram: '📱 Telegram: @{username}',
      telegramNoUsername: '📱 Telegram: yes (no username)',
      services: '🧰 Services ({minutes} min):\n{list}',
      time: '🕒 Time: {start} — {end}',
      total: '💰 Total: {price} {payment}',
      payOnSite: '💵 Pay on site',
      prepaymentOnline: '💳 Online prepayment',
      notesWithText: '📝 Notes: {notes}',
      notesNone: '📝 Notes: none',
      contactsCopyHeader: '📋 Contacts to copy into WhatsApp/Telegram:',
    },
    keyboard: {
      approve: '✅ Accept',
      reject: '❌ Reject',
      reschedule: '🔄 Reschedule',
      blacklist: '🚫 Blacklist',
      fulfill: '✅ Order fulfilled',
      copyContacts: '📋 Copy contacts',
    },
    copyContacts: {
      header: 'Client contacts · order #{orderNumber}',
      name: 'Name: {name}',
      phone: 'Phone: {phone}',
      whatsapp: 'WhatsApp: yes ({phone})',
      telegram: 'Telegram: @{username}',
      telegramNoUsername: 'Telegram: yes (no username)',
    },
    templates: {
      greetingFallback: 'Hello',
      services: 'Services: {services}.',
      duration: 'Duration: {minutes} min.',
      approveBody: '{name}, your booking #{orderNumber} is confirmed! ✅',
      approveFooter: 'Payment is on site. If your plans change, message us in advance.',
      waitAtTime: 'We will be waiting for you at the scheduled time.',
      rejectBody: '{name}, unfortunately booking #{orderNumber} cannot be accepted. ❌',
      rejectFooter: 'Message us — we will find another convenient time.',
      rescheduleIntro: '{name}, booking #{orderNumber} needs to be rescheduled. 🔄',
      rescheduleLink: 'Pick a new convenient time via the one-time link: {url}',
      rescheduleNoLink: 'Message us — we will find a new convenient time.',
      reschedulePlaceholder: '✏️ The master will add the rescheduling day and time here.',
      blacklistIntro: '{name}, booking #{orderNumber} has been annulled.',
      blacklistReason:
        'Reason: violation of the service rules (fixed pricing, discount/haggling requests are not considered). Access to online booking is restricted.',
      fulfillIntro: '{name}, thank you for your visit! ✅ Order #{orderNumber} is fulfilled.',
      fulfillFooter: 'We look forward to seeing you again.',
    },
    clientNotices: {
      approveAwaitingPayment:
        '✅ The master confirmed your booking #{orderNumber}! Please pay the invoice within 15 minutes.',
      approveConfirmed: '✅ Your booking #{orderNumber} has been confirmed by the master! See you.',
      rejected: '❌ Unfortunately, booking #{orderNumber} was rejected by the master.',
      blacklisted:
        'Your booking has been annulled due to a violation of the service rules (discount/haggling requests under fixed pricing). Access to online booking is restricted.',
      rescheduleOffered:
        '🔄 The master offered to reschedule booking #{orderNumber}. Pick a new convenient time via the one-time link: {url}',
    },
  },
};

/** Minimal {placeholder} interpolation over a dict entry (no ICU needed on bot surfaces). */
export function formatBotString(
  template: string,
  params: Record<string, string | number> = {}
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in params ? String(params[key]) : match
  );
}

export function getStaffBotStrings(locale: I18nLocale): StaffBotStrings {
  return STAFF_STRINGS[locale];
}

/**
 * Staff-surface locale (FR-412-equivalent): ShopSettings.defaultLocale via the
 * shared resolveLocale chain. No per-staff override column exists — documented
 * in specs/004-release-readiness (T041).
 *
 * Fallback is 'ru', NOT the web built-in default: the staff surface shipped
 * Russian-only (legacy hardcoded strings), so a missing/unsupported instance
 * default must not silently flip staff cards to English. Owner sets
 * defaultLocale to switch the staff surface.
 */
export function resolveStaffLocale(instanceDefault?: string | null): I18nLocale {
  return isSupportedLocale(instanceDefault ?? null)
    ? (instanceDefault as I18nLocale)
    : STAFF_FALLBACK_LOCALE;
}
