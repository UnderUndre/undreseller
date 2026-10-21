import { Bot, InlineKeyboard } from 'grammy';
import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/telemetry/logger';
import { enqueueTelegramOutbox, OUTBOX_PRIORITY, classifyTelegramError } from './telegramOutbox';

const staffToken = process.env.STAFF_BOT_TOKEN || 'DUMMY_STAFF_TOKEN_FOR_BUILD';

/**
 * Get cached botInfo from globalThis if available.
 * This survives Next.js module hot-reloads during development.
 */
function getCachedStaffBotInfo(): any {
  if (typeof globalThis !== 'undefined' && (globalThis as any).__staffBotInfo) {
    return (globalThis as any).__staffBotInfo;
  }
  return undefined;
}

// Create bot with cached botInfo if available
const cachedStaffBotInfo = getCachedStaffBotInfo();
export const staffBot = new Bot(staffToken, {
  botInfo: cachedStaffBotInfo,
});

export const GDPR_REDACTED_PLACEHOLDER = '[ДАННЫЕ_КЛИЕНТА_УДАЛЕНЫ_ПО_GDPR]';
export const MAGIC_RESCHEDULE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export function maskCustomerPhone(phone: string | null | undefined): string {
  if (!phone) return 'Не указан';
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

export function formatStaffOrderCard(data: StaffOrderCardData): string {
  const formattedPrice = (data.totalMinor / 100).toFixed(2);
  const clientSegmentLabel = data.isNewClient ? '🆕 Новый клиент' : '⭐ Постоянный клиент';
  const paymentLabel =
    data.paymentType === 'PAY_ON_SITE' ? '💵 Оплата на месте' : '💳 Онлайн-предоплата';
  // Админки нет: примечание показываем мастеру целиком, оно нужно для работы.
  const notesText = (data.customerNotes || '').trim();
  const notesIndicator = notesText ? `📝 Примечание: ${notesText}` : '📝 Примечание: нет';

  const servicesList = data.serviceTitles.map((t, i) => `  ${i + 1}. ${t}`).join('\n');

  const contactsLines: string[] = [];
  if (data.customerPhone) {
    contactsLines.push(`📞 Телефон: ${data.customerPhone}`);
  }
  if (data.hasWhatsApp) {
    contactsLines.push('💬 WhatsApp: есть (по указанному номеру)');
  }
  if (data.customerTgUsername) {
    contactsLines.push(`📱 Telegram: @${data.customerTgUsername}`);
  } else if (data.hasTelegram) {
    contactsLines.push('📱 Telegram: есть (юзернейм не указан)');
  }

  return [
    `🛎 Новая запись #${data.orderNumber}`,
    `👤 Клиент: ${data.customerName || 'Гость'} (${clientSegmentLabel})`,
    ...contactsLines,
    `🧰 Услуги (${data.totalDurationMin} мин):\n${servicesList}`,
    `🕒 Время: ${data.startTimeIso} — ${data.endTimeIso}`,
    `💰 Сумма: ${formattedPrice} ${data.currency} (${paymentLabel})`,
    notesIndicator,
    '',
    '📋 Контакты для копирования в WhatsApp/Telegram:',
    `${data.customerName || 'Клиент'} ${data.customerPhone || ''} ${data.customerTgUsername ? '@' + data.customerTgUsername : ''}`.trim(),
  ].join('\n');
}

export function formatRedactedStaffOrderCard(orderNumber: string, finalStatusLabel: string): string {
  return [
    `📋 Заказ #${orderNumber} — ${finalStatusLabel}`,
    `🔒 Персональные данные: ${GDPR_REDACTED_PLACEHOLDER}`,
  ].join('\n');
}

export function buildStaffActionKeyboard(orderId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('✅ Принять', `staff:approve:${orderId}`)
    .text('❌ Отклонить', `staff:reject:${orderId}`)
    .row()
    .text('🔄 Перенести', `staff:reschedule:${orderId}`)
    .text('🚫 В чёрный список', `staff:blacklist:${orderId}`)
    .row()
    .text('✅ Заказ выполнен', `staff:fulfill:${orderId}`)
    .row()
    .text('📋 Копировать контакты', `staff:copy_contacts:${orderId}`);
}

/**
 * Формирует готовый текст контактов клиента для копирования мастером
 * в WhatsApp/Telegram. Вызывается при нажатии «📋 Копировать контакты».
 */
export function formatCopyContactsText(params: {
  orderNumber: string;
  customerName?: string | null;
  customerPhone?: string | null;
  customerTgUsername?: string | null;
  hasWhatsApp?: boolean | null;
  hasTelegram?: boolean | null;
}): string {
  const { orderNumber, customerName, customerPhone } = params;
  let tgUsername = (params.customerTgUsername || '').trim();
  if (tgUsername.startsWith('@')) tgUsername = tgUsername.slice(1);

  const lines: string[] = [
    `Контакты клиента · заказ #${orderNumber}`,
    `Имя: ${customerName || '—'}`,
    `Телефон: ${customerPhone || '—'}`,
  ];
  if (params.hasWhatsApp) {
    lines.push(`WhatsApp: есть (${customerPhone || 'тот же номер'})`);
  }
  if (tgUsername) {
    lines.push(`Telegram: @${tgUsername}`);
  } else if (params.hasTelegram) {
    lines.push('Telegram: есть (юзернейм не указан)');
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
  params: MasterTemplateParams
): string {
  const name = params.customerName || 'Здравствуйте';
  const timeRange = formatTimeRange(params.startTimeIso, params.endTimeIso);
  const servicesLine = params.serviceTitles && params.serviceTitles.length > 0
    ? `Услуги: ${params.serviceTitles.join(', ')}.`
    : null;
  const durationLine = params.totalDurationMin
    ? `Длительность: ${params.totalDurationMin} мин.`
    : null;
  const bookingDetails = [servicesLine, durationLine, timeRange].filter(Boolean).join(' ');

  switch (action) {
    case 'approve':
      return [
        `${name}, ваша запись #${params.orderNumber} подтверждена! ✅`,
        bookingDetails ? bookingDetails : 'Ждём вас в назначенное время.',
        'Оплата — на месте. Если планы изменятся, напишите нам заранее.',
      ].join('\n');
    case 'reject':
      return [
        `${name}, к сожалению, запись #${params.orderNumber} не может быть принята. ❌`,
        bookingDetails || 'Напишите нам — подберём другое удобное время.',
      ].join('\n');
    case 'reschedule': {
      const linkLine = params.magicRescheduleUrl
        ? `Выберите новое удобное время по одноразовой ссылке: ${params.magicRescheduleUrl}`
        : 'Напишите нам — подберём новое удобное время.';
      return [
        `${name}, запись #${params.orderNumber} нужно перенести. 🔄`,
        bookingDetails ? bookingDetails : '✏️ Мастер добавит сюда день и время переноса.',
        linkLine,
      ].join('\n');
    }
    case 'blacklist':
      return [
        `${name}, запись #${params.orderNumber} аннулирована.`,
        ...(bookingDetails ? [bookingDetails] : []),
        'Причина: нарушение правил сервиса (фиксированный прайс, запросы скидок/торга не рассматриваются). Доступ к онлайн-записи ограничен.',
      ].join('\n');
    case 'fulfill':
      return [
        `${name}, спасибо за визит! ✅ Заказ #${params.orderNumber} выполнен.`,
        ...(bookingDetails ? [bookingDetails] : []),
        'Будем рады видеть вас снова.',
      ].join('\n');
  }
}

function getRescheduleSecret(): string {
  return (
    process.env.STAFF_WEBHOOK_SECRET ||
    process.env.ADMIN_TOKEN ||
    'default-sovereign-reschedule-secret'
  );
}

// Server-only crypto-функции живут в ./magicReschedule (node:crypto нельзя
// импортировать в staffBot: модуль попадает в клиентский бандл через botManager).
// Серверный код импортирует их напрямую из './magicReschedule'.

export async function dispatchStaffOrderPagerCard(
  data: StaffOrderCardData,
  destinationChatId: string
): Promise<{ queuedId: string; deduplicated: boolean }> {
  const text = formatStaffOrderCard(data);
  const keyboard = buildStaffActionKeyboard(data.orderId);

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
