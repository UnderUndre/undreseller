import { bot, sendWithRetry } from '@/lib/bot/telegramBot';
import { prisma } from '@/lib/db/prisma';
import { fulfillPayment } from './fulfillment';
import { logger } from '@/lib/telemetry/logger';

export interface StarsDispatchResult {
  handled: boolean;
  status?: number;
}

export async function handleStarsWebhookUpdate(body: Record<string, unknown>): Promise<StarsDispatchResult> {
  const preCheckoutQuery = body?.pre_checkout_query as Record<string, unknown> | undefined;
  const message = body?.message as Record<string, unknown> | undefined;
  const successfulPayment = message?.successful_payment as Record<string, unknown> | undefined;

  // 1. Handle pre_checkout_query
  if (preCheckoutQuery) {
    const queryId = String(preCheckoutQuery.id);
    const orderId = String(preCheckoutQuery.invoice_payload);

    try {
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: {
          reservation: true,
          items: { include: { item: true } },
        },
      });

      if (!order || order.status !== 'PENDING') {
        await sendWithRetry(() =>
          bot.api.answerPreCheckoutQuery(queryId, false, {
            error_message: 'Order is no longer pending or does not exist.',
          })
        );
        return { handled: true, status: 200 };
      }

      // Check reservation expiry if service order
      if (order.reservation) {
        const now = new Date();
        if (
          order.reservation.status !== 'HELD' ||
          (order.reservation.holdExpiresAt && order.reservation.holdExpiresAt <= now)
        ) {
          await sendWithRetry(() =>
            bot.api.answerPreCheckoutQuery(queryId, false, {
              error_message: 'Slot hold has expired. Please select a new slot.',
            })
          );
          return { handled: true, status: 200 };
        }
      }

      // Check stock availability if physical products
      for (const orderItem of order.items) {
        if (orderItem.item.itemType === 'PRODUCT' && orderItem.item.stock !== null) {
          if (orderItem.item.stock < orderItem.quantity) {
            await sendWithRetry(() =>
              bot.api.answerPreCheckoutQuery(queryId, false, {
                error_message: 'Product is currently out of stock.',
              })
            );
            return { handled: true, status: 200 };
          }
        }
      }

      // Pre-check passed: answer ok = true without capturing funds or altering order state
      await sendWithRetry(() => bot.api.answerPreCheckoutQuery(queryId, true));
      return { handled: true, status: 200 };
    } catch (err: unknown) {
      logger.error('Failed to answer pre_checkout_query', { error: String(err) });
      try {
        await sendWithRetry(() =>
          bot.api.answerPreCheckoutQuery(queryId, false, {
            error_message: 'Temporary server error during pre-checkout validation.',
          })
        );
      } catch {
        // Ignored fallback
      }
      return { handled: true, status: 200 };
    }
  }

  // 2. Handle successful_payment
  if (successfulPayment) {
    const orderId = String(successfulPayment.invoice_payload);
    const chargeId = String(successfulPayment.telegram_payment_charge_id);
    const totalAmount = Number(successfulPayment.total_amount);

    try {
      await fulfillPayment({
        orderId,
        provider: 'TELEGRAM_STARS',
        providerRef: chargeId,
        amountMinor: totalAmount,
        currency: 'XTR',
      });

      return { handled: true, status: 200 };
    } catch (err: unknown) {
      logger.error('Failed to fulfill Stars successful_payment', { error: String(err), chargeId });
      return { handled: true, status: 500 };
    }
  }

  return { handled: false };
}
