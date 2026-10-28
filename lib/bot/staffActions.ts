import { timingSafeEqual } from 'node:crypto';
import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/telemetry/logger';
import { normalizePhoneE164, PHONE_RISK_EXPIRY_MS } from '@/lib/booking/lock';
import {
  generateMagicRescheduleLink,
} from './magicReschedule';
import { enqueueStaffMessageRedaction } from './staffBot';
import { enqueueTelegramOutbox, OUTBOX_PRIORITY } from './telegramOutbox';
import {
  formatBotString,
  getStaffBotStrings,
  resolveStaffLocale,
} from '@/lib/i18n/botStrings';

export type StaffActionType = 'approve' | 'reject' | 'reschedule' | 'blacklist' | 'fulfill' | 'copy_contacts';

// ---------------------------------------------------------------------------
// FR-429 (T093): configurable rejection notification policy.
//
// No suitable ShopSettings/StaffMember column exists in the current schema
// (adding one would require a migration out of scope here), so the policy is
// env-configured: STAFF_REJECT_NOTIFY_MODE = 'notify_customer' | 'silent' |
// 'staff_only'. Default 'notify_customer' preserves existing behaviour.
// Documented in the 004 release-readiness tasks (T093).
// ---------------------------------------------------------------------------

export type StaffRejectNotifyMode = 'notify_customer' | 'silent' | 'staff_only';

export function resolveRejectNotifyMode(raw: string | null | undefined = process.env.STAFF_REJECT_NOTIFY_MODE): StaffRejectNotifyMode {
  const mode = (raw || '').trim().toLowerCase();
  if (mode === 'silent' || mode === 'staff_only' || mode === 'notify_customer') {
    return mode;
  }
  return 'notify_customer';
}

export interface RejectNotificationDecision {
  notifyCustomer: boolean;
  notifyStaff: boolean;
}

/** Pure decision: who gets informed when staff reject an order (FR-429). */
export function decideRejectNotification(
  mode: StaffRejectNotifyMode,
  hasCustomerTgId: boolean
): RejectNotificationDecision {
  switch (mode) {
    case 'silent':
      return { notifyCustomer: false, notifyStaff: false };
    case 'staff_only':
      return { notifyCustomer: false, notifyStaff: true };
    case 'notify_customer':
    default:
      return { notifyCustomer: hasCustomerTgId, notifyStaff: false };
  }
}

export function verifyStaffWebhookSecret(
  providedSecret: string | null,
  expectedSecret = process.env.STAFF_WEBHOOK_SECRET
): boolean {
  if (!providedSecret || !expectedSecret) return false;
  if (providedSecret.length !== expectedSecret.length) return false;
  return timingSafeEqual(
    Buffer.from(providedSecret, 'utf-8'),
    Buffer.from(expectedSecret, 'utf-8')
  );
}

export function authorizeStaffCallback(params: {
  chatId: string | number | null | undefined;
  fromUserId: string | number | null | undefined;
  staffDestinationChatId: string | null | undefined;
  authorizedStaffUserIds: string[];
}): { authorized: boolean; reason?: string } {
  const { chatId, fromUserId, staffDestinationChatId, authorizedStaffUserIds } = params;

  if (!chatId || !fromUserId || !staffDestinationChatId) {
    return { authorized: false, reason: 'MISSING_CHAT_OR_USER_CONTEXT' };
  }

  if (String(chatId) !== String(staffDestinationChatId)) {
    return { authorized: false, reason: 'CHAT_ID_MISMATCH' };
  }

  const actorId = String(fromUserId).trim();

  // 1. Список из БД (приоритетный источник истины)
  const normalizedAllowed = (authorizedStaffUserIds || []).map((id) => String(id).trim());
  if (normalizedAllowed.includes(actorId)) {
    return { authorized: true };
  }

  // 2. Fallback: STAFF_AUTHORIZED_IDS из .env (удобно для первоначальной настройки)
  const envIds = (process.env.STAFF_AUTHORIZED_IDS || process.env.STAFF_ADMIN_IDS || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  if (envIds.includes(actorId)) {
    return { authorized: true };
  }

  // 3. Индивидуальный чат мастера (1-на-1 с ботом): нажмал сам владелец чата
  if (String(chatId) === actorId) {
    return { authorized: true };
  }

  return { authorized: false, reason: 'USER_NOT_IN_AUTHORIZED_STAFF_LIST' };
}

export interface StaffOrderMemoryState {
  id: string;
  orderNumber: string;
  status:
    | 'PENDING'
    | 'AWAITING_PAYMENT'
    | 'PAID'
    | 'PAID_REQUIRES_RESOLUTION'
    | 'CANCELLED'
    | 'FULFILLED'
    | 'PAYMENT_EXPIRED';
  paymentType: 'PAY_ON_SITE' | 'PREPAYMENT_ONLINE';
  confirmationStatus:
    | 'PENDING_STAFF_REVIEW'
    | 'STAFF_APPROVED'
    | 'CLIENT_CONFIRMED'
    | 'RESCHEDULE_OFFERED';
  cancellationReason: string | null;
  reservationStatus: 'HELD' | 'BOOKED' | 'RELEASED';
  scheduleVersion: number;
  invoiceExpiresAt: Date | null;
  rescheduleTokenHash: string | null;
  rescheduleTokenConsumedAt: Date | null;
  customerTgId?: string | null;
  customerPhone?: string | null;
}

export interface PureStaffActionOutcome {
  outcome: 'APPLIED' | 'ALREADY_PROCESSED';
  updatedOrder: StaffOrderMemoryState;
  emittedEvent?:
    | 'order/staff-approved'
    | 'order/cancelled'
    | 'order/fulfilled'
    | 'order/reschedule-offered';
  removeInlineKeyboard: boolean;
  triggerGdprRedaction: boolean;
  magicRescheduleUrl?: string;
  blacklistedClient?: boolean;
}

export function executeStaffOrderActionPure(params: {
  order: StaffOrderMemoryState;
  action: StaffActionType;
  prepaymentTiming: 'IMMEDIATE' | 'AFTER_STAFF_APPROVAL';
  actorTelegramId: string;
  now?: Date;
}): PureStaffActionOutcome {
  const { order, action, prepaymentTiming, actorTelegramId, now = new Date() } = params;

  switch (action) {
    case 'approve': {
      if (
        order.status !== 'PENDING' ||
        order.confirmationStatus !== 'PENDING_STAFF_REVIEW'
      ) {
        return {
          outcome: 'ALREADY_PROCESSED',
          updatedOrder: order,
          removeInlineKeyboard: false,
          triggerGdprRedaction: false,
        };
      }

      const requiresDelayedInvoice =
        order.paymentType === 'PREPAYMENT_ONLINE' &&
        prepaymentTiming === 'AFTER_STAFF_APPROVAL';

      const updated: StaffOrderMemoryState = {
        ...order,
        status: requiresDelayedInvoice ? 'AWAITING_PAYMENT' : 'PENDING',
        confirmationStatus: 'STAFF_APPROVED',
        reservationStatus: requiresDelayedInvoice ? 'HELD' : 'BOOKED',
        invoiceExpiresAt: requiresDelayedInvoice
          ? new Date(now.getTime() + 15 * 60 * 1000)
          : order.invoiceExpiresAt,
        scheduleVersion: order.scheduleVersion + 1,
      };

      logger.info('[STAFF_ACTION]', {
        action: 'approve',
        orderId: order.id,
        actorTelegramId,
        newStatus: updated.status,
      });

      return {
        outcome: 'APPLIED',
        updatedOrder: updated,
        emittedEvent: 'order/staff-approved',
        removeInlineKeyboard: true,
        triggerGdprRedaction: false,
      };
    }

    case 'reject': {
      if (order.status !== 'PENDING' && order.status !== 'AWAITING_PAYMENT') {
        return {
          outcome: 'ALREADY_PROCESSED',
          updatedOrder: order,
          removeInlineKeyboard: false,
          triggerGdprRedaction: false,
        };
      }

      const updated: StaffOrderMemoryState = {
        ...order,
        status: 'CANCELLED',
        cancellationReason: 'STAFF_REJECTED',
        reservationStatus: 'RELEASED',
        scheduleVersion: order.scheduleVersion + 1,
      };

      logger.info('[STAFF_ACTION]', {
        action: 'reject',
        orderId: order.id,
        actorTelegramId,
      });

      return {
        outcome: 'APPLIED',
        updatedOrder: updated,
        emittedEvent: 'order/cancelled',
        removeInlineKeyboard: true,
        triggerGdprRedaction: false,
      };
    }

    case 'blacklist': {
      if (order.status !== 'PENDING' && order.status !== 'AWAITING_PAYMENT') {
        return {
          outcome: 'ALREADY_PROCESSED',
          updatedOrder: order,
          removeInlineKeyboard: false,
          triggerGdprRedaction: false,
        };
      }

      const updated: StaffOrderMemoryState = {
        ...order,
        status: 'CANCELLED',
        cancellationReason: 'CLIENT_BLOCKED',
        reservationStatus: 'RELEASED',
        scheduleVersion: order.scheduleVersion + 1,
      };

      logger.info('[STAFF_ACTION]', {
        action: 'blacklist',
        orderId: order.id,
        actorTelegramId,
      });
      logger.warn('[CLIENT_BLACKLISTED]', {
        orderId: order.id,
        actorTelegramId,
      });

      return {
        outcome: 'APPLIED',
        updatedOrder: updated,
        emittedEvent: 'order/cancelled',
        removeInlineKeyboard: true,
        triggerGdprRedaction: false,
        blacklistedClient: true,
      };
    }

    case 'reschedule': {
      if (
        order.status === 'CANCELLED' ||
        order.status === 'FULFILLED' ||
        order.status === 'PAYMENT_EXPIRED'
      ) {
        return {
          outcome: 'ALREADY_PROCESSED',
          updatedOrder: order,
          removeInlineKeyboard: false,
          triggerGdprRedaction: false,
        };
      }

      const bundle = generateMagicRescheduleLink({
        orderId: order.id,
        scheduleVersion: order.scheduleVersion,
        now,
      });

      const updated: StaffOrderMemoryState = {
        ...order,
        confirmationStatus: 'RESCHEDULE_OFFERED',
        rescheduleTokenHash: bundle.rescheduleTokenHash,
        rescheduleTokenConsumedAt: null,
      };

      logger.info('[STAFF_ACTION]', {
        action: 'reschedule',
        orderId: order.id,
        actorTelegramId,
      });

      return {
        outcome: 'APPLIED',
        updatedOrder: updated,
        emittedEvent: 'order/reschedule-offered',
        removeInlineKeyboard: true,
        triggerGdprRedaction: false,
        magicRescheduleUrl: bundle.url,
      };
    }

    case 'fulfill': {
      const validStatus = order.status === 'PENDING' || order.status === 'PAID';
      const validConfirmation =
        order.confirmationStatus === 'STAFF_APPROVED' ||
        order.confirmationStatus === 'CLIENT_CONFIRMED';

      if (!validStatus || !validConfirmation) {
        return {
          outcome: 'ALREADY_PROCESSED',
          updatedOrder: order,
          removeInlineKeyboard: false,
          triggerGdprRedaction: false,
        };
      }

      const updated: StaffOrderMemoryState = {
        ...order,
        status: 'FULFILLED',
        reservationStatus: 'BOOKED',
        scheduleVersion: order.scheduleVersion + 1,
      };

      logger.info('[STAFF_ACTION]', {
        action: 'fulfill',
        orderId: order.id,
        actorTelegramId,
      });

      return {
        outcome: 'APPLIED',
        updatedOrder: updated,
        emittedEvent: 'order/fulfilled',
        removeInlineKeyboard: true,
        triggerGdprRedaction: true,
      };
    }

    case 'copy_contacts': {
      // Не мутирующее действие: текст формируется в вебхуке, состояние не меняется.
      return {
        outcome: 'ALREADY_PROCESSED',
        updatedOrder: order,
        removeInlineKeyboard: false,
        triggerGdprRedaction: false,
      };
    }
  }
}

export async function executeStaffCallbackTransaction(params: {
  callbackQueryId: string;
  orderId: string;
  action: StaffActionType;
  actorTelegramId: string;
  chatId: string;
  messageId?: number;
}): Promise<{
  outcome: 'APPLIED' | 'ALREADY_PROCESSED' | 'DUPLICATE_CALLBACK';
  emittedEvent?: string;
  magicRescheduleUrl?: string;
}> {
  const { callbackQueryId, orderId, action, actorTelegramId, chatId, messageId } = params;
  const dedupeKey = `staff_cbq_${callbackQueryId}`;

  const existingCbq = await prisma.inboxEvent.findUnique({
    where: { dedupeKey },
    select: { id: true },
  });
  if (existingCbq) {
    return { outcome: 'DUPLICATE_CALLBACK' };
  }

  const now = new Date();
  // T041 (FR-412-equivalent): staff locale = ShopSettings.defaultLocale
  // (no per-staff override column — documented in botStrings.ts).
  let instanceDefault: string | null = null;
  const txResult = await prisma.$transaction(async (tx) => {
    await tx.inboxEvent.create({
      data: {
        provider: 'STAFF_BOT_CALLBACK',
        eventId: callbackQueryId,
        dedupeKey,
        kind: 'TELEGRAM_UPDATE',
        botProfile: 'STAFF_BOT',
        chatId,
        status: 'SENT',
        payloadJson: {
          action,
          orderId,
          actorTelegramId,
        },
      },
    });

    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { reservation: true },
    });

    if (!order) {
      return { outcome: 'ALREADY_PROCESSED' as const, order: null, pureOutcome: null };
    }

    const settings = await tx.shopSettings.findUnique({ where: { id: 1 } });
    const prepaymentTiming =
      (settings?.prepaymentTiming as 'IMMEDIATE' | 'AFTER_STAFF_APPROVAL') || 'IMMEDIATE';
    instanceDefault = settings?.defaultLocale ?? null;

    const pureOutcome = executeStaffOrderActionPure({
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status as StaffOrderMemoryState['status'],
        paymentType: order.paymentType as StaffOrderMemoryState['paymentType'],
        confirmationStatus: order.confirmationStatus as StaffOrderMemoryState['confirmationStatus'],
        cancellationReason: order.cancellationReason,
        reservationStatus: (order.reservation?.status || 'HELD') as StaffOrderMemoryState['reservationStatus'],
        scheduleVersion: order.scheduleVersion,
        invoiceExpiresAt: order.invoiceExpiresAt,
        rescheduleTokenHash: order.rescheduleTokenHash,
        rescheduleTokenConsumedAt: order.rescheduleTokenConsumedAt,
        customerTgId: order.customerTgId,
        customerPhone: order.customerPhone,
      },
      action,
      prepaymentTiming,
      actorTelegramId,
      now,
    });

    if (pureOutcome.outcome === 'ALREADY_PROCESSED') {
      return { outcome: 'ALREADY_PROCESSED' as const, order, pureOutcome };
    }

    // Apply CAS update on Order
    const casUpdate = await tx.order.updateMany({
      where: {
        id: order.id,
        scheduleVersion: order.scheduleVersion,
      },
      data: {
        status: pureOutcome.updatedOrder.status,
        confirmationStatus: pureOutcome.updatedOrder.confirmationStatus,
        cancellationReason: pureOutcome.updatedOrder.cancellationReason as never,
        scheduleVersion: pureOutcome.updatedOrder.scheduleVersion,
        invoiceExpiresAt: pureOutcome.updatedOrder.invoiceExpiresAt,
        rescheduleTokenHash: pureOutcome.updatedOrder.rescheduleTokenHash,
        rescheduleTokenConsumedAt: pureOutcome.updatedOrder.rescheduleTokenConsumedAt,
        staffChatId: chatId,
        staffMessageId: messageId ?? order.staffMessageId,
      },
    });

    if (casUpdate.count === 0) {
      return { outcome: 'ALREADY_PROCESSED' as const, order, pureOutcome: null };
    }

    if (order.reservation) {
      await tx.slotReservation.update({
        where: { id: order.reservation.id },
        data: {
          status: pureOutcome.updatedOrder.reservationStatus,
          holdExpiresAt:
            pureOutcome.updatedOrder.status === 'AWAITING_PAYMENT'
              ? pureOutcome.updatedOrder.invoiceExpiresAt
              : pureOutcome.updatedOrder.reservationStatus === 'BOOKED'
                ? null
                : order.reservation.holdExpiresAt,
        },
      });
    }

    if (pureOutcome.blacklistedClient) {
      const riskExpiresAt = new Date(now.getTime() + PHONE_RISK_EXPIRY_MS);
      if (order.customerTgId) {
        await tx.messengerContact.upsert({
          where: {
            platform_externalId: {
              platform: 'TELEGRAM',
              externalId: order.customerTgId,
            },
          },
          update: {
            isBlocked: true,
            customerId: order.customerTgId,
          },
          create: {
            platform: 'TELEGRAM',
            externalId: order.customerTgId,
            customerId: order.customerTgId,
            isBlocked: true,
          },
        });
      }

      const normPhone = normalizePhoneE164(order.customerPhone);
      if (normPhone) {
        await tx.messengerContact.upsert({
          where: {
            platform_externalId: {
              platform: 'WHATSAPP',
              externalId: normPhone,
            },
          },
          update: {
            isBlocked: true,
            customerId: order.customerTgId ?? null,
            phoneVerifiedAt: order.customerTgId ? now : null,
            phoneVerificationMethod: order.customerTgId ? 'TELEGRAM_LINKED' : 'UNVERIFIED_PHONE_ONLY',
            requiresManualReview: !order.customerTgId,
            phoneRiskExpiresAt: riskExpiresAt,
          },
          create: {
            platform: 'WHATSAPP',
            externalId: normPhone,
            customerId: order.customerTgId ?? null,
            isBlocked: true,
            phoneVerifiedAt: order.customerTgId ? now : null,
            phoneVerificationMethod: order.customerTgId ? 'TELEGRAM_LINKED' : 'UNVERIFIED_PHONE_ONLY',
            requiresManualReview: !order.customerTgId,
            phoneRiskExpiresAt: riskExpiresAt,
          },
        });
      }
    }

    return { outcome: 'APPLIED' as const, order, pureOutcome };
  });

  if (txResult.outcome !== 'APPLIED' || !txResult.order || !txResult.pureOutcome) {
    return { outcome: 'ALREADY_PROCESSED' };
  }

  const { order, pureOutcome } = txResult;

  // Enqueue high-priority terminal keyboard removal or GDPR redaction after DB commit
  if (pureOutcome.triggerGdprRedaction) {
    await enqueueStaffMessageRedaction({
      orderId: order.id,
      orderNumber: order.orderNumber,
      staffChatId: chatId,
      staffMessageId: messageId ?? order.staffMessageId ?? null,
      finalStatusLabel: pureOutcome.updatedOrder.status,
    });
  } else if (pureOutcome.removeInlineKeyboard && messageId) {
    await enqueueTelegramOutbox({
      botProfile: 'STAFF_BOT',
      chatId,
      priority: OUTBOX_PRIORITY.CRITICAL_GDPR_AND_MARKUP,
      dedupeKey: `staff_rm_kb_${order.id}_v${pureOutcome.updatedOrder.scheduleVersion}`,
      action: 'editMessageReplyMarkup',
      messageId,
      replyMarkup: { inline_keyboard: [] },
      orderId: order.id,
    });
  }

  // Enqueue client notification if client has Telegram ID
  if (order.customerTgId) {
    // T041 (FR-411): client notices keyed by the staff-surface locale
    // (ShopSettings.defaultLocale via resolveStaffLocale).
    const notices = getStaffBotStrings(resolveStaffLocale(instanceDefault)).clientNotices;
    let clientNotice: string | null = null;
    if (action === 'approve') {
      clientNotice =
        pureOutcome.updatedOrder.status === 'AWAITING_PAYMENT'
          ? formatBotString(notices.approveAwaitingPayment, { orderNumber: order.orderNumber })
          : formatBotString(notices.approveConfirmed, { orderNumber: order.orderNumber });
    } else if (action === 'reject') {
      clientNotice = formatBotString(notices.rejected, { orderNumber: order.orderNumber });
    } else if (action === 'blacklist') {
      clientNotice = notices.blacklisted;
    } else if (action === 'reschedule' && pureOutcome.magicRescheduleUrl) {
      clientNotice = formatBotString(notices.rescheduleOffered, {
        orderNumber: order.orderNumber,
        url: pureOutcome.magicRescheduleUrl,
      });
    }

    // FR-429 (T093): rejection notices follow the owner-configurable policy.
    if (action === 'reject' && clientNotice) {
      const decision = decideRejectNotification(resolveRejectNotifyMode(), Boolean(order.customerTgId));
      if (decision.notifyStaff) {
        await enqueueTelegramOutbox({
          botProfile: 'STAFF_BOT',
          chatId,
          priority: OUTBOX_PRIORITY.HIGH_STAFF_PAGER,
          dedupeKey: `staff_notice_${order.id}_reject_v${pureOutcome.updatedOrder.scheduleVersion}`,
          action: 'sendMessage',
          text: clientNotice,
          orderId: order.id,
        });
      }
      if (!decision.notifyCustomer) {
        clientNotice = null;
      }
    }

    if (clientNotice) {
      await enqueueTelegramOutbox({
        botProfile: 'CLIENT_BOT',
        chatId: order.customerTgId,
        priority: OUTBOX_PRIORITY.HIGH_STAFF_PAGER,
        dedupeKey: `client_notice_${order.id}_${action}_v${pureOutcome.updatedOrder.scheduleVersion}`,
        action: 'sendMessage',
        text: clientNotice,
        orderId: order.id,
      });
    }
  }

  return {
    outcome: 'APPLIED',
    emittedEvent: pureOutcome.emittedEvent,
    magicRescheduleUrl: pureOutcome.magicRescheduleUrl,
  };
}
