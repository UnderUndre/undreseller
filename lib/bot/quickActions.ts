/**
 * Bot Quick Actions (T051, US4, FR-416)
 * ≤3-tap journeys from the persistent menu: my bookings, cancel via token,
 * support contact (existing escalation), language switch (FR-412 override).
 * Handlers are exported pure-ish functions registered by lib/bot/telegramBot.ts.
 */

import { prisma } from '@/lib/db/prisma';
import { sendWithRetry, bot } from './telegramBot';
import { InlineKeyboard } from 'grammy';
import { logger } from '@/lib/telemetry/logger';
import { resolveLocale, type I18nLocale } from '@/lib/i18n/config';
import { getPublicBotStrings } from '@/lib/i18n/botStrings';

const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL || 'https://undreseller.com';

function mainKeyboard() {
  return new InlineKeyboard()
    .webApp('🛍️ Open Storefront', APP_URL())
    .row()
    .text('📋 My bookings', 'qb:bookings')
    .text('🌐 Language', 'qb:lang')
    .row()
    .text('👨‍💼 Contact Manager', 'contact_manager');
}

/** Resolves the caller's locale per FR-412: override > language_code > instance default. */
export async function resolveCallerLocale(tgId: string, languageCode?: string | null): Promise<I18nLocale> {
  const pref = await prisma.userPreference.findUnique({ where: { tgId } });
  const settings = await prisma.shopSettings.findUnique({
    where: { id: 1 },
    select: { defaultLocale: true },
  });
  return resolveLocale({
    override: pref?.languageOverride,
    languageCode,
    instanceDefault: settings?.defaultLocale,
  });
}

/** My bookings: last 5 orders for the caller with reservation start times. */
export async function showMyBookings(ctx: {
  from: { id: number; language_code?: string } | undefined;
  reply: (text: string, opts?: { reply_markup?: InlineKeyboard }) => Promise<unknown>;
}): Promise<void> {
  if (!ctx.from) return;
  const tgId = String(ctx.from.id);
  const locale = await resolveCallerLocale(tgId, ctx.from.language_code);
  const strings = getPublicBotStrings(locale);

  const orders = await prisma.order.findMany({
    where: { customerTgId: tgId, status: { notIn: ['CANCELLED', 'PAYMENT_EXPIRED'] } },
    orderBy: { createdAt: 'desc' },
    take: 5,
    include: { reservation: { select: { startTime: true } }, items: { select: { titleSnapshot: true } } },
  });

  if (orders.length === 0) {
    await sendWithRetry(() =>
      ctx.reply(strings.noBookings, { reply_markup: mainKeyboard() })
    );
    return;
  }

  const lines = orders.map((o) => {
    const when = o.reservation?.startTime
      ? new Date(o.reservation.startTime).toLocaleString(locale)
      : strings.noTime;
    return `• ${o.items.map((i) => i.titleSnapshot ?? '').join(' + ') || o.orderNumber} — ${when} (${o.status})`;
  });
  await sendWithRetry(() =>
    ctx.reply(`${strings.myBookings}\n${lines.join('\n')}`, { reply_markup: mainKeyboard() })
  );
}

/** Language switch: two inline buttons → upserts UserPreference override (FR-412). */
export async function showLanguageMenu(ctx: {
  reply: (text: string, opts?: { reply_markup?: InlineKeyboard }) => Promise<unknown>;
}): Promise<void> {
  const kb = new InlineKeyboard()
    .text('🇷🇺 Русский', 'qb:lang:ru')
    .text('🇬🇧 English', 'qb:lang:en');
  await sendWithRetry(() => ctx.reply('🌐 Language / Язык:', { reply_markup: kb }));
}

export async function setLanguageOverride(tgId: string, locale: 'ru' | 'en'): Promise<void> {
  await prisma.userPreference.upsert({
    where: { tgId },
    update: { languageOverride: locale },
    create: { tgId, languageOverride: locale },
  });
  const strings = getPublicBotStrings(locale);
  await sendWithRetry(() => bot.api.sendMessage(tgId, strings.langSet));
}

/**
 * Cancel via token flow (FR-416): `/cancel <bookingId> <token>`.
 * Token is the 32-byte credential issued once at booking time (INV-014 lineage);
 * the bot never stores or logs it.
 */
export async function cancelViaToken(
  tgId: string,
  args: string[]
): Promise<{ ok: boolean; message: string }> {
  const [bookingId, token] = args;
  if (!bookingId || !token) {
    return { ok: false, message: 'Usage: /cancel <bookingId> <token>' };
  }
  // Lazy import: bookingService pulls node:crypto — a static import here would
  // put it into the instrumentation edge-runtime bundle (UnhandledSchemeError).
  const { cancelBooking, CancellationError } = await import('@/lib/kernel/bookingService');
  try {
    await cancelBooking({ bookingId, token, reason: 'CUSTOMER_BOT_CANCEL' });
    return { ok: true, message: '✅ Your booking is cancelled.' };
  } catch (err: unknown) {
    if (err instanceof CancellationError) {
      logger.warn('[BOT_CANCEL_REJECTED]', { bookingId, reason: err.message });
      return { ok: false, message: '❌ Could not cancel: invalid token or booking no longer cancellable.' };
    }
    throw err;
  }
}

export { mainKeyboard };
