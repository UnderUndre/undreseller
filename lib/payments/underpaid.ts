/**
 * UNDERPAID payment flow (T024, contracts/payment-provider.md, FR-407/FR-432)
 * A finished callback with paid < 99% of quoted transitions the booking to
 * UNDERPAID (FSM: PAYMENT_PENDING → UNDERPAID — pure core in bookingFsm.ts),
 * alerts staff (SLA ≤ 12 h) and sends the customer a top-up/cancel message.
 * NO auto-confirm: only explicit staff resolution (STAFF_RESOLVE_CONFIRM /
 * STAFF_RESOLVE_CANCEL) may move an UNDERPAID booking forward.
 * Standards: NIST SP 800-218 SSDF & ISO/IEC/IEEE 12207:2017
 */

import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/telemetry/logger';
import { bot, sendWithRetry } from '@/lib/bot/telegramBot';
import { logDeliveryAttempt } from '@/lib/notifications/deliveryLog';
import { formatMinorUnits } from '../../config/currency-registry';

export interface UnderpaidPaymentInput {
  orderId: string;
  providerPaymentId: string;
  quotedMinor: number;
  paidMinor: number;
  currency: string;
}

export interface UnderpaidOutcome {
  /** Reservation transitioned to UNDERPAID (no auto-expire, staff resolution window). */
  reservationUpdated: boolean;
  staffNotified: boolean;
  customerNotified: boolean;
}

/** Staff resolution SLA for underpayments (contract test table: ≤ 12 h). */
export const UNDERPAID_STAFF_SLA_HOURS = 12;

export async function handleUnderpaidPayment(
  input: UnderpaidPaymentInput
): Promise<UnderpaidOutcome> {
  const outcome: UnderpaidOutcome = {
    reservationUpdated: false,
    staffNotified: false,
    customerNotified: false,
  };

  // 1. Persist the FSM transition PAYMENT_PENDING → UNDERPAID (T020 core).
  //    holdExpiresAt / holdFrozenAt cleared: the staff resolution window has no
  //    payment TTL and no auto-expire. Guarded update = idempotent CAS.
  const updated = await prisma.slotReservation.updateMany({
    where: { orderId: input.orderId, status: { in: ['HELD', 'PAYMENT_PENDING'] } },
    data: { status: 'UNDERPAID', holdExpiresAt: null, holdFrozenAt: null },
  });
  outcome.reservationUpdated = updated.count === 1;

  if (updated.count === 0) {
    // Unknown / already-resolved booking — log and stop; never auto-confirm.
    logger.warn('[UNDERPAID_NO_ACTIVE_HOLD]', { orderId: input.orderId });
  }

  // 2. Resolve notification targets.
  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    select: { orderNumber: true, customerTgId: true },
  });
  const settings = await prisma.shopSettings.findUnique({
    where: { id: 1 },
    select: { staffDestinationChatId: true },
  });
  const staffChatId =
    settings?.staffDestinationChatId || process.env.STAFF_CHAT_ID || process.env.ADMIN_CHAT_ID || null;

  const quotedLabel = formatMinorUnits(input.quotedMinor, input.currency);
  const paidLabel = formatMinorUnits(input.paidMinor, input.currency);

  // 3. Staff alert (SLA ≤ 12 h).
  if (staffChatId) {
    const startedAt = new Date();
    try {
      await sendWithRetry(() =>
        bot.api.sendMessage(
          staffChatId,
          [
            `⚠️ [UNDERPAYMENT_ALERT] Order ${order?.orderNumber ?? input.orderId}`,
            `Expected: ${quotedLabel} — received: ${paidLabel} (${input.currency}).`,
            `Booking moved to UNDERPAID. Resolve manually within ${UNDERPAID_STAFF_SLA_HOURS}h: confirm after top-up or cancel + refund.`,
            `Payment ref: ${input.providerPaymentId}`,
          ].join('\n')
        )
      );
      outcome.staffNotified = true;
      await logDeliveryAttempt({
        channel: 'TELEGRAM',
        target: staffChatId,
        status: 'ACCEPTED',
        orderId: input.orderId,
        providerRef: input.providerPaymentId,
        startedAt,
      });
    } catch (err: unknown) {
      logger.error('[UNDERPAID_STAFF_ALERT_FAILED]', { error: String(err) });
      await logDeliveryAttempt({
        channel: 'TELEGRAM',
        target: staffChatId,
        status: 'FAILED',
        orderId: input.orderId,
        providerRef: input.providerPaymentId,
        errorCode: 'STAFF_ALERT_SEND_FAILED',
        startedAt,
      });
    }
  } else {
    logger.warn('[UNDERPAID_STAFF_CHAT_UNCONFIGURED]', { orderId: input.orderId });
  }

  // 4. Customer top-up / cancel message (no auto-confirm, no auto-refund).
  if (order?.customerTgId) {
    const startedAt = new Date();
    try {
      await sendWithRetry(() =>
        bot.api.sendMessage(
          order.customerTgId!,
          [
            `💳 Payment for order ${order.orderNumber} was incomplete.`,
            `Received ${paidLabel} of ${quotedLabel}.`,
            'Top up the remaining amount, or reply to cancel — our staff will help you resolve this.',
          ].join('\n')
        )
      );
      outcome.customerNotified = true;
      await logDeliveryAttempt({
        channel: 'TELEGRAM',
        target: order.customerTgId,
        status: 'ACCEPTED',
        orderId: input.orderId,
        providerRef: input.providerPaymentId,
        startedAt,
      });
    } catch (err: unknown) {
      logger.error('[UNDERPAID_CUSTOMER_MSG_FAILED]', { error: String(err) });
      await logDeliveryAttempt({
        channel: 'TELEGRAM',
        target: order.customerTgId,
        status: 'FAILED',
        orderId: input.orderId,
        providerRef: input.providerPaymentId,
        errorCode: 'CUSTOMER_MSG_SEND_FAILED',
        startedAt,
      });
    }
  }

  return outcome;
}
