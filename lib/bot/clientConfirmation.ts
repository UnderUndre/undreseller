import { InlineKeyboard } from 'grammy';
import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/telemetry/logger';
import { enqueueTelegramOutbox, OUTBOX_PRIORITY } from './telegramOutbox';

export type ClientConfirmationDecision = 'confirm' | 'decline';

export const EXPIRED_CONFIRMATION_MESSAGE =
  'К сожалению, время подтверждения истекло и запись была отменена. Пожалуйста, забронируйте свободное время заново';

export function buildClientReminderKeyboard(orderId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('👍 Подтверждаю, буду!', `client:confirm:${orderId}`)
    .text('🚫 Не смогу прийти', `client:decline:${orderId}`);
}

export interface ClientConfirmationOrderState {
  id: string;
  orderNumber: string;
  status: string;
  confirmationStatus: string;
  cancellationReason: string | null;
  reservationStatus: 'HELD' | 'BOOKED' | 'RELEASED';
  scheduleVersion: number;
}

export function evaluateClientConfirmationPure(params: {
  order: ClientConfirmationOrderState;
  decision: ClientConfirmationDecision;
}): {
  outcome: 'CONFIRMED' | 'DECLINED_CANCELLED' | 'EXPIRED_OR_CANCELLED' | 'ALREADY_PROCESSED';
  replyMessage: string;
  emittedEvents: string[];
  updatedOrder: ClientConfirmationOrderState;
} {
  const { order, decision } = params;

  if (order.status === 'CANCELLED' || order.status === 'PAYMENT_EXPIRED') {
    return {
      outcome: 'EXPIRED_OR_CANCELLED',
      replyMessage: EXPIRED_CONFIRMATION_MESSAGE,
      emittedEvents: [],
      updatedOrder: order,
    };
  }

  if (order.status !== 'PENDING' && order.status !== 'PAID') {
    return {
      outcome: 'ALREADY_PROCESSED',
      replyMessage: 'Заказ уже завершён или обработан.',
      emittedEvents: [],
      updatedOrder: order,
    };
  }

  if (decision === 'confirm') {
    if (order.confirmationStatus === 'CLIENT_CONFIRMED') {
      return {
        outcome: 'ALREADY_PROCESSED',
        replyMessage: 'Вы уже подтвердили ваш визит. Ждём вас!',
        emittedEvents: [],
        updatedOrder: order,
      };
    }

    const updated: ClientConfirmationOrderState = {
      ...order,
      confirmationStatus: 'CLIENT_CONFIRMED',
      reservationStatus: 'BOOKED',
      scheduleVersion: order.scheduleVersion + 1,
    };

    return {
      outcome: 'CONFIRMED',
      replyMessage: `✅ Спасибо! Ваш визит по заказу #${order.orderNumber} подтверждён.`,
      emittedEvents: ['order/client-confirmed'],
      updatedOrder: updated,
    };
  }

  // decision === 'decline'
  const updated: ClientConfirmationOrderState = {
    ...order,
    status: 'CANCELLED',
    cancellationReason: 'CLIENT_DECLINED',
    reservationStatus: 'RELEASED',
    scheduleVersion: order.scheduleVersion + 1,
  };

  return {
    outcome: 'DECLINED_CANCELLED',
    replyMessage: `🚫 Запись #${order.orderNumber} отменена по вашему запросу. Будем рады видеть вас в другой раз!`,
    emittedEvents: ['order/client-declined', 'order/cancelled'],
    updatedOrder: updated,
  };
}

export async function handleClientConfirmationCallback(params: {
  orderId: string;
  decision: ClientConfirmationDecision;
  customerTgId?: string;
}): Promise<{
  outcome: 'CONFIRMED' | 'DECLINED_CANCELLED' | 'EXPIRED_OR_CANCELLED' | 'ALREADY_PROCESSED';
  replyMessage: string;
  emittedEvents: string[];
}> {
  const { orderId, decision } = params;

  const txResult = await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { reservation: true },
    });

    if (!order) {
      return {
        outcome: 'EXPIRED_OR_CANCELLED' as const,
        replyMessage: EXPIRED_CONFIRMATION_MESSAGE,
        emittedEvents: [] as string[],
        order: null,
        evaluated: null,
      };
    }

    const evaluated = evaluateClientConfirmationPure({
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        confirmationStatus: order.confirmationStatus,
        cancellationReason: order.cancellationReason,
        reservationStatus: (order.reservation?.status || 'BOOKED') as
          | 'HELD'
          | 'BOOKED'
          | 'RELEASED',
        scheduleVersion: order.scheduleVersion,
      },
      decision,
    });

    if (
      evaluated.outcome === 'EXPIRED_OR_CANCELLED' ||
      evaluated.outcome === 'ALREADY_PROCESSED'
    ) {
      return {
        outcome: evaluated.outcome,
        replyMessage: evaluated.replyMessage,
        emittedEvents: [],
        order,
        evaluated,
      };
    }

    const cas = await tx.order.updateMany({
      where: {
        id: order.id,
        scheduleVersion: order.scheduleVersion,
      },
      data: {
        status: evaluated.updatedOrder.status as never,
        confirmationStatus: evaluated.updatedOrder.confirmationStatus as never,
        cancellationReason: evaluated.updatedOrder.cancellationReason as never,
        scheduleVersion: evaluated.updatedOrder.scheduleVersion,
      },
    });

    if (cas.count === 0) {
      return {
        outcome: 'ALREADY_PROCESSED' as const,
        replyMessage: 'Запрос уже обработан.',
        emittedEvents: [] as string[],
        order,
        evaluated: null,
      };
    }

    if (order.reservation) {
      await tx.slotReservation.update({
        where: { id: order.reservation.id },
        data: {
          status: evaluated.updatedOrder.reservationStatus,
        },
      });
    }

    return {
      outcome: evaluated.outcome,
      replyMessage: evaluated.replyMessage,
      emittedEvents: evaluated.emittedEvents,
      order,
      evaluated,
    };
  });

  if (txResult.order && txResult.evaluated) {
    const settings = await prisma.shopSettings.findUnique({ where: { id: 1 } });
    const staffChatId =
      txResult.order.staffChatId ||
      settings?.staffDestinationChatId ||
      process.env.STAFF_CHAT_ID;

    if (staffChatId) {
      const staffText =
        txResult.outcome === 'CONFIRMED'
          ? `✅ Клиент подтвердил визит по заказу #${txResult.order.orderNumber}!`
          : `🚫 Клиент отменил визит по заказу #${txResult.order.orderNumber}. Слот освобождён в календаре.`;

      await enqueueTelegramOutbox({
        botProfile: 'STAFF_BOT',
        chatId: staffChatId,
        priority: OUTBOX_PRIORITY.HIGH_STAFF_PAGER,
        dedupeKey: `staff_client_${decision}_${txResult.order.id}_v${txResult.evaluated.updatedOrder.scheduleVersion}`,
        action: 'sendMessage',
        text: staffText,
        orderId: txResult.order.id,
      });

      // GDPR redaction отключено: контакты клиента должны оставаться видимыми мастерам.
    }
  }

  logger.info('[CLIENT_CONFIRMATION_RESPONSE]', {
    orderId,
    decision,
    outcome: txResult.outcome,
  });

  return {
    outcome: txResult.outcome,
    replyMessage: txResult.replyMessage,
    emittedEvents: txResult.emittedEvents,
  };
}
