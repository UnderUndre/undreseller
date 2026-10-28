import { Bot, InlineKeyboard } from 'grammy';
import type { UserFromGetMe } from '@grammyjs/types';
import { logger } from '@/lib/telemetry/logger';
import { getCurrencyMetadata } from '../../config/currency-registry';
import { enqueueTelegramOutbox, OUTBOX_PRIORITY, classifyTelegramError } from './telegramOutbox';
import { formatBotString, getStaffBotStrings } from '@/lib/i18n/botStrings';
import type { I18nLocale } from '@/lib/i18n/config';

const staffToken = process.env.STAFF_BOT_TOKEN || 'DUMMY_STAFF_TOKEN_FOR_BUILD';

/**
 * Get cached botInfo from globalThis if available.
 * This survives Next.js module hot-reloads during development.
 */
function getCachedStaffBotInfo(): UserFromGetMe | undefined {
  return typeof globalThis !== 'undefined' ? globalThis.__staffBotInfo : undefined;
}

// Create bot with cached botInfo if available
const cachedStaffBotInfo = getCachedStaffBotInfo();
export const staffBot = new Bot(staffToken, {
  botInfo: cachedStaffBotInfo,
});

export const GDPR_REDACTED_PLACEHOLDER = '[ДАННЫЕ_КЛИЕНТА_УДАЛЕНЫ_ПО_GDPR]';
export const MAGIC_RESCHEDULE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export function maskCustomerPhone(phone: string | null | undefined, locale: I18nLocale = 'ru'): string {
  if (!phone) return getStaffBotStrings(locale).phoneNotSpecified;
  const digits = String(phone).replace(/[^\d]/g, '');
  if (digits.length < 4) return '***';
  const last4 = digits.slice(-4);
  const countryPrefix = digits.startsWith('7')
    ? '+7'
    : digits.startsWith('374')
      ? '+374'
      : digits.startsWith('1')
        ? '+1'
        : `+${digits.slice(0, Math.max(1, digits.length - 10))}`;
  return `${countryPrefix} *** *** ${last4}`;
}

export interface StaffOrderCardData {
  orderId: string;
  orderNumber: string;
  serviceTitles: string[];
  totalDurationMin: number;
  startTimeIso: string;
  endTimeIso: string;
  totalMinor: number;
  currency: string;
  paymentType: 'PAY_ON_SITE' | 'PREPAYMENT_ONLINE' | string;
  customerName?: string | null;
  customerPhone?: string | null;
  customerTgUsername?: string | null;
  hasWhatsApp?: boolean;
  hasTelegram?: boolean;
  hasCustomerNotes: boolean;
  customerNotes?: string | null;
  isNewClient: boolean;
  status?: string;
  confirmationStatus?: string;
}

export function formatStaffOrderCard(data: StaffOrderCardData, locale: I18nLocale = 'ru'): string {
  // T026: registry minor-unit scale (JPY 0 / KWD 3), never hard-coded /100.
  // T041 (FR-411/412): staff-bot chrome via StaffBotStrings keyed by
  // ShopSettings.defaultLocale; service titles (business data) stay authored.
  const minorUnit = getCurrencyMetadata(data.currency)?.minorUnit ?? 2;
  const formattedPrice = (data.totalMinor / Math.pow(10, minorUnit)).toFixed(minorUnit);
  const st = getStaffBotStrings(locale);
  const clientSegmentLabel = data.isNewClient ? st.card.newClient : st.card.returningClient;
  const paymentLabel =
    data.paymentType === 'PAY_ON_SITE' ? st.card.payOnSite : st.card.prepaymentOnline;
  // Админки нет: примечание показываем мастеру целиком, оно нужно для работы.
  const notesText = (data.customerNotes || '').trim();
  const notesIndicator = notesText
    ? formatBotString(st.card.notesWithText, { notes: notesText })
    : st.card.notesNone;

  const servicesList = data.serviceTitles.map((t, i) => `  ${i + 1}. ${t}`).join('\n');

  const contactsLines: string[] = [];
  if (data.customerPhone) {
    contactsLines.push(formatBotString(st.card.phone, { phone: data.customerPhone }));
  }
  if (data.hasWhatsApp) {
    contactsLines.push(st.card.whatsapp);
  }
  if (data.customerTgUsername) {
    contactsLines.push(formatBotString(st.card.telegram, { username: data.customerTgUsername }));
  } else if (data.hasTelegram) {
    contactsLines.push(st.card.telegramNoUsername);
  }

  return [
    formatBotString(st.card.newOrder, { orderNumber: data.orderNumber }),
    formatBotString(st.card.client, {
      name: data.customerName || st.card.guest,
      segment: clientSegmentLabel,
    }),
    ...contactsLines,
    formatBotString(st.card.services, { minutes: data.totalDurationMin, list: servicesList }),
    formatBotString(st.card.time, { start: data.startTimeIso, end: data.endTimeIso }),
    formatBotString(st.card.total, { price: `${formattedPrice} ${data.currency}`, payment: paymentLabel }),
    notesIndicator,
    '',
    st.card.contactsCopyHeader,
    `${data.customerName || 'Клиент'} ${data.customerPhone || ''} ${data.customerTgUsername ? '@' + data.customerTgUsername : ''}`.trim(),
  ].join('\n');
}

export function formatRedactedStaffOrderCard(
  orderNumber: string,
  finalStatusLabel: string,
  locale: I18nLocale = 'ru'
): string {
  const st = getStaffBotStrings(locale);
  return [
    formatBotString(st.card.newOrder, { orderNumber })
      .replace(/^🛎/, '📋') + ` — ${finalStatusLabel}`,
    `🔒 Персональные данные: ${GDPR_REDACTED_PLACEHOLDER}`,
  ].join('\n');
}

export function buildStaffActionKeyboard(orderId: string, locale: I18nLocale = 'ru'): InlineKeyboard {
  const kb = getStaffBotStrings(locale).keyboard;
  return new InlineKeyboard()
    .text(kb.approve, `staff:approve:${orderId}`)
    .text(kb.reject, `staff:reject:${orderId}`)
    .row()
    .text(kb.reschedule, `staff:reschedule:${orderId}`)
    .text(kb.blacklist, `staff:blacklist:${orderId}`)
    .row()
    .text(kb.fulfill, `staff:fulfill:${orderId}`)
    .row()
    .text(kb.copyContacts, `staff:copy_contacts:${orderId}`);
}

/**
 * Формирует готовый текст контактов клиента для копирования мастером
 * в WhatsApp/Telegram. Вызывается при нажатии «📋 Копировать контакты».
 */
export function formatCopyContactsText(
  params: {
    orderNumber: string;
    customerName?: string | null;
    customerPhone?: string | null;
    customerTgUsername?: string | null;
    hasWhatsApp?: boolean | null;
    hasTelegram?: boolean | null;
  },
  locale: I18nLocale = 'ru'
): string {
  const { orderNumber, customerName, customerPhone } = params;
  let tgUsername = (params.customerTgUsername || '').trim();
  if (tgUsername.startsWith('@')) tgUsername = tgUsername.slice(1);

  const st = getStaffBotStrings(locale).copyContacts;
  const lines: string[] = [
    formatBotString(st.header, { orderNumber }),
    formatBotString(st.name, { name: customerName || '—' }),
    formatBotString(st.phone, { phone: customerPhone || '—' }),
  ];
  if (params.hasWhatsApp) {
    lines.push(formatBotString(st.whatsapp, { phone: customerPhone || '—' }));
  }
  if (tgUsername) {
    lines.push(formatBotString(st.telegram, { username: tgUsername }));
  } else if (params.hasTelegram) {
    lines.push(st.telegramNoUsername);
  }
  return lines.join('\n');
}

/**
 * Шаблонные тексты, которые мастер копирует и вручную отправляет клиенту
 * в WhatsApp/Telegram после нажатия кнопок. Вызываются из вебхука вместе
 * с ответом на callback — мастер видит текст в popup и копирует его.
 */
function formatTimeFromIso(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (isNaN(date.getTime())) return null;
  // Время хранится в UTC, конвертируем в локальное (Армения UTC+4)
  const localMinutes = date.getUTCMinutes() + date.getUTCHours() * 60 + 4 * 60;
  const h = Math.floor((localMinutes / 60) % 24).toString().padStart(2, '0');
  const m = (localMinutes % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

function formatTimeRange(startIso: string | null | undefined, endIso: string | null | undefined): string | null {
  const start = formatTimeFromIso(startIso);
  const end = formatTimeFromIso(endIso);
  if (!start || !end) return null;
  return `${start} — ${end}`;
}

export interface MasterTemplateParams {
  orderNumber: string;
  customerName?: string | null;
  serviceTitles?: string[];
  totalDurationMin?: number | null;
  startTimeIso?: string | null;
  endTimeIso?: string | null;
  magicRescheduleUrl?: string | null;
}

export function formatMasterTemplate(
  action: 'approve' | 'reject' | 'reschedule' | 'blacklist' | 'fulfill',
  params: MasterTemplateParams,
  locale: I18nLocale = 'ru'
): string {
  // T041 (FR-411): customer-facing template texts via StaffBotStrings.
  const tpl = getStaffBotStrings(locale).templates;
  const name = params.customerName || tpl.greetingFallback;
  const timeRange = formatTimeRange(params.startTimeIso, params.endTimeIso);
  const servicesLine = params.serviceTitles && params.serviceTitles.length > 0
    ? formatBotString(tpl.services, { services: params.serviceTitles.join(', ') })
    : null;
  const durationLine = params.totalDurationMin
    ? formatBotString(tpl.duration, { minutes: params.totalDurationMin })
    : null;
  const bookingDetails = [servicesLine, durationLine, timeRange].filter(Boolean).join(' ');

  switch (action) {
    case 'approve':
      return [
        formatBotString(tpl.approveBody, { name, orderNumber: params.orderNumber }),
        bookingDetails ? bookingDetails : tpl.waitAtTime,
        tpl.approveFooter,
      ].join('\n');
    case 'reject':
      return [
        formatBotString(tpl.rejectBody, { name, orderNumber: params.orderNumber }),
        bookingDetails || tpl.rejectFooter,
      ].join('\n');
    case 'reschedule': {
      const linkLine = params.magicRescheduleUrl
        ? formatBotString(tpl.rescheduleLink, { url: params.magicRescheduleUrl })
        : tpl.rescheduleNoLink;
      return [
        formatBotString(tpl.rescheduleIntro, { name, orderNumber: params.orderNumber }),
        bookingDetails ? bookingDetails : tpl.reschedulePlaceholder,
        linkLine,
      ].join('\n');
    }
    case 'blacklist':
      return [
        formatBotString(tpl.blacklistIntro, { name, orderNumber: params.orderNumber }),
        ...(bookingDetails ? [bookingDetails] : []),
        tpl.blacklistReason,
      ].join('\n');
    case 'fulfill':
      return [
        formatBotString(tpl.fulfillIntro, { name, orderNumber: params.orderNumber }),
        ...(bookingDetails ? [bookingDetails] : []),
        tpl.fulfillFooter,
      ].join('\n');
  }
}

// Server-only crypto-функции живут в ./magicReschedule (node:crypto нельзя
// импортировать в staffBot: модуль попадает в клиентский бандл через botManager).
// Серверный код импортирует их напрямую из './magicReschedule'.

export async function dispatchStaffOrderPagerCard(
  data: StaffOrderCardData,
  destinationChatId: string,
  locale: I18nLocale = 'ru'
): Promise<{ queuedId: string; deduplicated: boolean }> {
  const text = formatStaffOrderCard(data, locale);
  const keyboard = buildStaffActionKeyboard(data.orderId, locale);

  const res = await enqueueTelegramOutbox({
    botProfile: 'STAFF_BOT',
    chatId: destinationChatId,
    priority: OUTBOX_PRIORITY.HIGH_STAFF_PAGER,
    dedupeKey: `staff_pager_${data.orderId}_v1`,
    action: 'sendMessage',
    text,
    replyMarkup: keyboard,
    orderId: data.orderId,
  });

  logger.info('[STAFF_DISPATCH_SENT]', {
    orderId: data.orderId,
    queuedId: res.id,
  });

  return { queuedId: res.id, deduplicated: res.deduplicated };
}

export async function enqueueStaffMessageRedaction(params: {
  orderId: string;
  orderNumber: string;
  staffChatId: string | null;
  staffMessageId: number | null;
  finalStatusLabel: string;
}): Promise<{ queued: boolean; reason?: string }> {
  if (!params.staffChatId || !params.staffMessageId) {
    return { queued: false, reason: 'NO_STAFF_MESSAGE_METADATA' };
  }

  const redactedText = formatRedactedStaffOrderCard(params.orderNumber, params.finalStatusLabel);

  await enqueueTelegramOutbox({
    botProfile: 'STAFF_BOT',
    chatId: params.staffChatId,
    priority: OUTBOX_PRIORITY.CRITICAL_GDPR_AND_MARKUP,
    dedupeKey: `gdpr_redact_${params.orderId}`,
    action: 'editMessageText',
    messageId: params.staffMessageId,
    text: redactedText,
    replyMarkup: { inline_keyboard: [] },
    orderId: params.orderId,
  });

  return { queued: true };
}

export async function executeDirectTelegramRedactionWithTaxonomy(params: {
  orderId: string;
  orderNumber: string;
  staffChatId: string;
  staffMessageId: number;
  finalStatusLabel: string;
  apiAdapter?: {
    editMessageText: (chatId: string, messageId: number, text: string, extra?: unknown) => Promise<unknown>;
  };
}): Promise<{ outcome: 'REDACTED' | 'TERMINAL_NO_OP' | 'ENQUEUED_FOR_RETRY' }> {
  const redactedText = formatRedactedStaffOrderCard(params.orderNumber, params.finalStatusLabel);
  const adapter = params.apiAdapter || staffBot.api;

  try {
    await adapter.editMessageText(params.staffChatId, params.staffMessageId, redactedText, {
      reply_markup: { inline_keyboard: [] },
    });
    return { outcome: 'REDACTED' };
  } catch (err: unknown) {
    const classified = classifyTelegramError(err);
    if (classified.category === 'PERMANENT_NO_OP') {
      logger.info('[GDPR_REDACT_TERMINAL_NO_OP]', {
        orderId: params.orderId,
        reason: classified.reason,
      });
      return { outcome: 'TERMINAL_NO_OP' };
    }

    await enqueueStaffMessageRedaction({
      orderId: params.orderId,
      orderNumber: params.orderNumber,
      staffChatId: params.staffChatId,
      staffMessageId: params.staffMessageId,
      finalStatusLabel: params.finalStatusLabel,
    });
    return { outcome: 'ENQUEUED_FOR_RETRY' };
  }
}
