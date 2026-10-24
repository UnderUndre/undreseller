/**
 * Notification Dispatcher (T032, US2, FR-408/409)
 * Lifecycle events → Telegram primary → email fallback when TG fails
 * → every attempt recorded in NotificationDeliveryLog (T014).
 * Email fallback SLA: dispatched immediately; the ≤5 min budget is covered by
 * the Inngest retry schedule (max 3 attempts over ≤5 min) — no poller.
 */

import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/telemetry/logger';
import { sendWithRetry, bot } from '@/lib/bot/telegramBot';
import { logDeliveryAttempt } from './deliveryLog';
import { resolveEmailProvider, type EmailMessage } from '@/lib/email/emailProvider';
import { getReleaseReadinessFlags } from '@/lib/config/integrationProfile';

export type NotificationLifecycleEvent =
  | 'BOOKING_CONFIRMED'
  | 'BOOKING_CANCELLED'
  | 'BOOKING_REMINDER'
  | 'BOOKING_HELD'
  | 'ORDER_UNDERPAID';

export interface DispatchNotificationInput {
  event: NotificationLifecycleEvent;
  /** Customer Telegram chat id (primary channel). */
  chatId: string;
  /** Pre-rendered TG message text (i18n applied by the caller, T041). */
  text: string;
  /** Email fallback address from the order, if any (FR-409). */
  customerEmail?: string | null;
  /** Fallback email content (i18n applied by the caller). */
  email?: { subject: string; html: string };
  orderId?: string | null;
  bookingRefId?: string | null;
}

/** Retry schedule for the email fallback: total ≤5 min (FR-409). */
export const EMAIL_FALLBACK_RETRY_SCHEDULE: string[] = ['1m', '2m', '2m'];

/**
 * Fallback dispatch (synchronous form used by unit tests and Inngest steps):
 * attempts email once and records the delivery attempt.
 */
export async function dispatchEmailFallback(input: {
  customerEmail: string;
  email: { subject: string; html: string };
  orderId?: string | null;
  bookingRefId?: string | null;
}): Promise<'ACCEPTED' | 'FAILED' | 'NO_EMAIL_CHANNEL'> {
  const provider = resolveEmailProvider();
  const message: EmailMessage = {
    to: input.customerEmail,
    subject: input.email.subject,
    html: input.email.html,
  };

  const startedAt = new Date();
  let result;
  try {
    result = await provider.send(message);
  } catch (err: unknown) {
    result = { status: 'FAILED' as const, errorCode: String(err) };
  }

  await logDeliveryAttempt({
    channel: 'EMAIL',
    target: input.customerEmail,
    status: result.status === 'ACCEPTED' ? 'ACCEPTED' : 'FAILED',
    errorCode: result.errorCode ?? null,
    providerRef: result.providerRef ?? null,
    orderId: input.orderId ?? null,
    bookingRefId: input.bookingRefId ?? null,
    startedAt,
  });

  if (result.status === 'NO_EMAIL_CHANNEL') {
    logger.warn('[NOTIFY_FALLBACK_NO_CHANNEL]', {
      orderId: input.orderId ?? null,
      errorCode: result.errorCode ?? null,
    });
  }
  return result.status;
}

/**
 * Dispatch a lifecycle notification: TG primary; on failure, email fallback
 * when an address and content exist. Every attempt is delivery-logged.
 */
export async function dispatchLifecycleNotification(
  input: DispatchNotificationInput
): Promise<{ primary: 'ACCEPTED' | 'FAILED'; fallback: 'ACCEPTED' | 'FAILED' | 'NO_EMAIL_CHANNEL' | 'NOT_NEEDED' | 'NO_ADDRESS' }> {
  let primary: 'ACCEPTED' | 'FAILED' = 'FAILED';
  const startedAt = new Date();

  try {
    await sendWithRetry(() => bot.api.sendMessage(input.chatId, input.text, { parse_mode: 'HTML' }));
    primary = 'ACCEPTED';
  } catch (err: unknown) {
    logger.warn('[NOTIFY_PRIMARY_FAILED]', {
      event: input.event,
      orderId: input.orderId ?? null,
      error: String(err),
    });
  }

  await logDeliveryAttempt({
    channel: 'TELEGRAM',
    target: input.chatId,
    status: primary,
    orderId: input.orderId ?? null,
    bookingRefId: input.bookingRefId ?? null,
    startedAt,
  });

  if (primary === 'ACCEPTED') {
    return { primary, fallback: 'NOT_NEEDED' };
  }

  const flags = getReleaseReadinessFlags();
  if (!flags.emailFallbackEnabled) {
    return { primary, fallback: 'NOT_NEEDED' };
  }

  if (!input.customerEmail || !input.email) {
    // FR-409: no email channel on file → staff warning path (T032 acceptance)
    logger.warn('[NOTIFY_NO_EMAIL_CHANNEL_ON_FILE]', {
      event: input.event,
      orderId: input.orderId ?? null,
    });
    return { primary, fallback: 'NO_ADDRESS' };
  }

  const fallback = await dispatchEmailFallback({
    customerEmail: input.customerEmail,
    email: input.email,
    orderId: input.orderId ?? null,
    bookingRefId: input.bookingRefId ?? null,
  });
  return { primary, fallback };
}

/** Delivery history visible to staff (T034 acceptance) — hashes only, no raw PII. */
export async function getDeliveryHistoryForOrder(orderId: string) {
  return prisma.notificationDeliveryLog.findMany({
    where: { orderId },
    orderBy: { attemptAt: 'desc' },
    select: {
      id: true,
      channel: true,
      targetHash: true,
      status: true,
      errorCode: true,
      attemptAt: true,
      latencyMs: true,
    },
  });
}
