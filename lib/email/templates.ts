/**
 * Email Templates ru/en (T042, US3, FR-413)
 * Typed dictionaries + ICU-style interpolation for lifecycle emails.
 * Locale resolved by the caller via the FR-412 chain (dispatcher/T043).
 */

import type { I18nLocale } from '@/lib/i18n/config';

export interface BookingEmailVars {
  businessName: string;
  serviceTitle: string;
  startsAt: string; // pre-formatted by caller (locale-aware)
  orderNumber: string;
  serviceAddress?: string | null;
}

export interface BookingEmailTemplate {
  subject: string;
  html: string;
  text: string;
}

type Renderer = (v: BookingEmailVars) => BookingEmailTemplate;

const TEMPLATES: Record<'bookingConfirmed' | 'bookingCancelled' | 'bookingReminder', Record<I18nLocale, Renderer>> = {
  bookingConfirmed: {
    en: (v) => ({
      subject: `Your appointment at ${v.businessName} is confirmed (#${v.orderNumber})`,
      text: `Your ${v.serviceTitle} on ${v.startsAt} is confirmed. Booking #${v.orderNumber}.`,
      html: `<h2>✅ Appointment confirmed</h2><p>${escape(v.serviceTitle)} — <strong>${escape(v.startsAt)}</strong></p><p>Booking #${escape(v.orderNumber)} at ${escape(v.businessName)}.</p>${
        v.serviceAddress ? `<p>📍 ${escape(v.serviceAddress)}</p>` : ''
      }`,
    }),
    ru: (v) => ({
      subject: `Ваша запись в ${v.businessName} подтверждена (#${v.orderNumber})`,
      text: `${v.serviceTitle} на ${v.startsAt} подтверждено. Запись #${v.orderNumber}.`,
      html: `<h2>✅ Запись подтверждена</h2><p>${escape(v.serviceTitle)} — <strong>${escape(v.startsAt)}</strong></p><p>Запись #${escape(v.orderNumber)} в ${escape(v.businessName)}.</p>${
        v.serviceAddress ? `<p>📍 ${escape(v.serviceAddress)}</p>` : ''
      }`,
    }),
  },
  bookingCancelled: {
    en: (v) => ({
      subject: `Your booking at ${v.businessName} was cancelled (#${v.orderNumber})`,
      text: `Your ${v.serviceTitle} on ${v.startsAt} was cancelled. Booking #${v.orderNumber}.`,
      html: `<h2>❌ Booking cancelled</h2><p>${escape(v.serviceTitle)} — ${escape(v.startsAt)} (booking #${escape(v.orderNumber)}).</p><p>You can book a new time in our storefront.</p>`,
    }),
    ru: (v) => ({
      subject: `Ваша запись в ${v.businessName} отменена (#${v.orderNumber})`,
      text: `${v.serviceTitle} на ${v.startsAt} отменено. Запись #${v.orderNumber}.`,
      html: `<h2>❌ Запись отменена</h2><p>${escape(v.serviceTitle)} — ${escape(v.startsAt)} (запись #${escape(v.orderNumber)}).</p><p>Вы можете выбрать новое время в витрине.</p>`,
    }),
  },
  bookingReminder: {
    en: (v) => ({
      subject: `Reminder: ${v.serviceTitle} at ${v.startsAt} (#${v.orderNumber})`,
      text: `Reminder: your ${v.serviceTitle} is scheduled for ${v.startsAt}.`,
      html: `<h2>⏰ Appointment reminder</h2><p>${escape(v.serviceTitle)} — <strong>${escape(v.startsAt)}</strong></p>${
        v.serviceAddress ? `<p>📍 ${escape(v.serviceAddress)}</p>` : ''
      }`,
    }),
    ru: (v) => ({
      subject: `Напоминание: ${v.serviceTitle} в ${v.startsAt} (#${v.orderNumber})`,
      text: `Напоминание: ${v.serviceTitle} запланировано на ${v.startsAt}.`,
      html: `<h2>⏰ Напоминание о записи</h2><p>${escape(v.serviceTitle)} — <strong>${escape(v.startsAt)}</strong></p>${
        v.serviceAddress ? `<p>📍 ${escape(v.serviceAddress)}</p>` : ''
      }`,
    }),
  },
};

/** Minimal HTML escaping — customer-influenced values are interpolated everywhere. */
function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderBookingEmail(
  kind: keyof typeof TEMPLATES,
  locale: I18nLocale,
  vars: BookingEmailVars
): BookingEmailTemplate {
  return TEMPLATES[kind][locale](vars);
}
