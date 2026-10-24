/**
 * Refund-on-cancellation policy (T028, FR-430).
 * A cancelled PREPAID booking inside the refund window (Item.cancellationCutoffHours
 * before the appointment start) records a RefundOperation request with a 24 h SLA
 * and notifies customer + staff. Outside the window the deposit is forfeited per
 * policy. PAY_ON_SITE orders are never applicable (nothing to refund).
 * Standards: NIST SP 800-218 SSDF & ISO/IEC/IEEE 12207:2017
 */

import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/telemetry/logger';
import { bot, sendWithRetry } from '@/lib/bot/telegramBot';
import { logDeliveryAttempt } from '@/lib/notifications/deliveryLog';

/** Refund-request handling SLA (contracts/payment-provider.md: RefundOperation SLA 24 h). */
export const REFUND_REQUEST_SLA_HOURS = 24;

/** Deposit-forfeiture verdict reason codes. */
export type CancellationRefundReason =
  | 'NOT_PREPAID'
  | 'REFUND_WINDOW_OPEN'
  | 'REFUND_WINDOW_CLOSED';

export interface RefundPolicyOrder {
  paymentMethod?: string | null;
  /** True when the order has already been paid (prepaid capture succeeded). */
  paid: boolean;
}

export interface RefundPolicyConfig {
  /** Refund window length in hours before the appointment start (Item.cancellationCutoffHours). */
  cancellationCutoffHours: number;
  /** When false, out-of-window cancellations do NOT forfeit the deposit (default true = forfeit). */
  forfeitOutsideWindow?: boolean;
}

export interface CancellationRefundVerdict {
  /** True when a refund decision applies at all (prepaid orders only). */
  applicable: boolean;
  refundable: boolean;
  forfeitDeposit: boolean;
  /** Non-null → a RefundOperation must be recorded with this SLA. */
  refundRequest: { slaHours: number } | null;
  reason: CancellationRefundReason;
}

/**
 * Pure policy evaluation (FR-430). `now` is injected — deterministic.
 * Inside the window (now ≤ appointmentStart − cutoffHours) → refundable;
 * outside → deposit forfeiture per policy; PAY_ON_SITE / unpaid → not applicable.
 */
export function evaluateRefundOnCancellation(
  order: RefundPolicyOrder,
  policy: RefundPolicyConfig,
  now: Date,
  appointmentStart: Date
): CancellationRefundVerdict {
  const prepaid =
    order.paid &&
    (order.paymentMethod === 'TELEGRAM_STARS' || order.paymentMethod === 'CRYPTO_GATEWAY');

  if (!prepaid) {
    return {
      applicable: false,
      refundable: false,
      forfeitDeposit: false,
      refundRequest: null,
      reason: 'NOT_PREPAID',
    };
  }

  const cutoffHours = policy.cancellationCutoffHours ?? 3;
  const cutoffDeadline =
    appointmentStart.getTime() - cutoffHours * 60 * 60 * 1000;

  if (now.getTime() <= cutoffDeadline) {
    return {
      applicable: true,
      refundable: true,
      forfeitDeposit: false,
      refundRequest: { slaHours: REFUND_REQUEST_SLA_HOURS },
      reason: 'REFUND_WINDOW_OPEN',
    };
  }

  return {
    applicable: true,
    refundable: false,
    forfeitDeposit: policy.forfeitOutsideWindow !== false,
    refundRequest: null,
    reason: 'REFUND_WINDOW_CLOSED',
  };
}

export interface ApplyRefundOnCancellationInput {
  /** Reservation id OR orderId (same lookup contract as cancelBooking). */
  bookingId: string;
  actor: string;
  now?: Date;
}

export interface ApplyRefundOnCancellationOutcome {
  evaluated: boolean;
  verdict: CancellationRefundVerdict | null;
  refundRecorded: boolean;
  customerNotified: boolean;
  staffNotified: boolean;
}

/**
 * Service wiring for the cancellation path: loads order + reservation, evaluates
 * the policy, and on a refundable verdict records the RefundOperation (REQUESTED,
 * idempotent by key) and notifies customer + staff. Never throws into the caller —
 * refund wiring must not fail the cancellation itself.
 */
export async function applyRefundPolicyOnCancellation(
  input: ApplyRefundOnCancellationInput
): Promise<ApplyRefundOnCancellationOutcome> {
  const now = input.now ?? new Date();
  const outcome: ApplyRefundOnCancellationOutcome = {
    evaluated: false,
    verdict: null,
    refundRecorded: false,
    customerNotified: false,
    staffNotified: false,
  };

  const reservation = await prisma.slotReservation.findFirst({
    where: { OR: [{ id: input.bookingId }, { orderId: input.bookingId }] },
    include: { item: true, order: true },
  });
  if (!reservation) return outcome;

  const order = reservation.order;
  const paid =
    !!order.paymentRef ||
    order.status === 'PAID' ||
    order.status === 'PAID_REQUIRES_RESOLUTION' ||
    order.refundStatus === 'REFUND_REQUESTED';

  const verdict = evaluateRefundOnCancellation(
    { paymentMethod: order.paymentMethod, paid },
    { cancellationCutoffHours: reservation.item?.cancellationCutoffHours ?? 3 },
    now,
    reservation.appointmentStartTime ?? reservation.startTime
  );
  outcome.evaluated = true;
  outcome.verdict = verdict;

  if (!verdict.applicable) return outcome;

  if (!verdict.refundRequest) {
    logger.warn('[REFUND_FORFEIT_OUTSIDE_WINDOW]', {
      orderId: order.id,
      actor: input.actor,
      reason: verdict.reason,
    });
    return outcome;
  }

  // Refundable: record the RefundOperation request (idempotent) + notifications.
  const kind = order.paymentMethod === 'TELEGRAM_STARS' ? 'TELEGRAM_STARS_REFUND' : 'CRYPTO_REIMBURSEMENT';
  const idempotencyKey = `cancel_refund_req_${order.id}`;
  const existing = await prisma.refundOperation.findUnique({ where: { idempotencyKey } });
  if (existing) {
    outcome.refundRecorded = true;
    return outcome;
  }

  await prisma.refundOperation.create({
    data: {
      orderId: order.id,
      kind,
      status: 'REQUESTED',
      idempotencyKey,
      providerRef: order.paymentRef ?? null,
      amountMinor: order.totalMinor,
      currency: order.currency,
      actor: input.actor,
      reason: 'CUSTOMER_CANCELLATION_WITHIN_REFUND_WINDOW',
      slaDueAt: new Date(now.getTime() + verdict.refundRequest.slaHours * 60 * 60 * 1000),
    },
  });
  outcome.refundRecorded = true;

  // Notifications (dispatch pattern: TG primary, delivery log on every attempt).
  const settings = await prisma.shopSettings.findUnique({
    where: { id: 1 },
    select: { staffDestinationChatId: true },
  });
  const staffChatId =
    settings?.staffDestinationChatId || process.env.STAFF_CHAT_ID || process.env.ADMIN_CHAT_ID || null;

  if (order.customerTgId) {
    try {
      await sendWithRetry(() =>
        bot.api.sendMessage(
          order.customerTgId!,
          `↩️ Cancellation confirmed for order ${order.orderNumber}. A refund of your prepayment has been requested — it will be processed within ${REFUND_REQUEST_SLA_HOURS}h.`
        )
      );
      outcome.customerNotified = true;
      await logDeliveryAttempt({
        channel: 'TELEGRAM',
        target: order.customerTgId,
        status: 'ACCEPTED',
        orderId: order.id,
        startedAt: now,
      });
    } catch (err: unknown) {
      logger.error('[REFUND_CUSTOMER_NOTIFY_FAILED]', { error: String(err) });
    }
  }

  if (staffChatId) {
    try {
      await sendWithRetry(() =>
        bot.api.sendMessage(
          staffChatId,
          `[REFUND_REQUEST] Order ${order.orderNumber} cancelled within the refund window. Kind: ${kind}. Amount: ${order.totalMinor} ${order.currency}. Process within ${REFUND_REQUEST_SLA_HOURS}h.`
        )
      );
      outcome.staffNotified = true;
      await logDeliveryAttempt({
        channel: 'TELEGRAM',
        target: staffChatId,
        status: 'ACCEPTED',
        orderId: order.id,
        startedAt: now,
      });
    } catch (err: unknown) {
      logger.error('[REFUND_STAFF_NOTIFY_FAILED]', { error: String(err) });
    }
  }

  return outcome;
}
