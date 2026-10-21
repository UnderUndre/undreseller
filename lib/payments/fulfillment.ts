import { prisma } from '@/lib/db/prisma';
import { acquireResourceSlotLock, acquireItemSlotLock } from '@/lib/booking/advisoryLock';
import { logger } from '@/lib/telemetry/logger';
import { PaymentMethod } from '@prisma/client';

export interface FulfillPaymentParams {
  orderId: string;
  provider: PaymentMethod;
  providerRef: string;
  amountMinor: number;
  currency: string;
}

export async function fulfillPayment(
  params: FulfillPaymentParams
): Promise<{ status: string; requiresOperatorAction: boolean }> {
  const { orderId, provider, providerRef, amountMinor, currency } = params;

  return await prisma.$transaction(async (tx) => {
    // 1. Idempotency Check: if PaymentEvent already exists, return 200 immediately
    const existingPayment = await tx.paymentEvent.findUnique({
      where: {
        provider_providerRef: {
          provider,
          providerRef,
        },
      },
    });

    if (existingPayment) {
      logger.info('Duplicate payment webhook ignored', { provider, providerRef });
      return { status: 'ALREADY_PAID', requiresOperatorAction: false };
    }

    // 2. Fetch order with items and reservation
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: {
        items: true,
        reservation: true,
      },
    });

    if (!order) {
      throw new Error(`Order ${orderId} not found for fulfillment`);
    }

    // 3. Resource-scoped advisory lock + item locks
    if (order.reservation) {
      await acquireResourceSlotLock(tx, order.reservation.resourceId || 'default_master');
    }

    const uniqueItemIds = Array.from(
      new Set([
        ...order.items.map((i) => i.itemId),
        ...(order.reservation?.itemId ? [order.reservation.itemId] : []),
      ])
    ).sort();

    for (const itemId of uniqueItemIds) {
      await acquireItemSlotLock(tx, itemId);
    }

    // 4. Record immutable PaymentEvent
    await tx.paymentEvent.create({
      data: {
        orderId: order.id,
        provider,
        providerRef,
        amountMinor,
        currency,
        accepted: true,
      },
    });

    let requiresOperatorAction = false;
    let operatorActionReason: string | null = null;
    let targetOrderStatus: 'PAID' | 'PAID_REQUIRES_RESOLUTION' = 'PAID';
    let targetRefundStatus: 'NONE' | 'REFUND_REQUESTED' = 'NONE';
    const now = new Date();

    // 5. Service Reservation fulfillment (including late payment webhook after PAYMENT_EXPIRED)
    if (order.reservation) {
      const res = order.reservation;
      const resourceId = res.resourceId || 'default_master';

      // Check for overlapping HELD or BOOKED reservation on the same resource (excluding self)
      const collision = await tx.slotReservation.findFirst({
        where: {
          id: { not: res.id },
          OR: [{ resourceId }, ...(res.itemId ? [{ itemId: res.itemId }] : [])],
          status: { in: ['HELD', 'BOOKED'] },
          startTime: { lt: res.endTime },
          endTime: { gt: res.startTime },
        },
      });

      if (collision) {
        // Late webhook or concurrent slot collision: transition to PAID_REQUIRES_RESOLUTION with 24h SLA
        requiresOperatorAction = true;
        operatorActionReason = 'OVERBOOKED_MANUAL_RESOLUTION';
        targetOrderStatus = 'PAID_REQUIRES_RESOLUTION';
        targetRefundStatus = 'REFUND_REQUESTED';

        await tx.slotReservation.update({
          where: { id: res.id },
          data: {
            status: 'RELEASED',
            requiresOperatorAction: true,
            operatorActionReason,
          },
        });

        await tx.refundOperation.create({
          data: {
            orderId: order.id,
            kind:
              provider === 'TELEGRAM_STARS'
                ? 'TELEGRAM_STARS_REFUND'
                : 'CRYPTO_REIMBURSEMENT',
            status: 'REQUESTED',
            idempotencyKey: `auto_refund_req_${order.id}_${providerRef}`,
            providerRef,
            amountMinor,
            currency,
            actor: 'SYSTEM_LATE_WEBHOOK_SLA',
            reason: 'OVERBOOKED_MANUAL_RESOLUTION',
            slaDueAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
          },
        });

        logger.warn('[SLOT_OVERBOOK_COLLISION]', {
          orderId: order.id,
          slotId: res.id,
          targetOrderStatus,
        });
      } else {
        // Slot is free -> transition reservation to BOOKED
        await tx.slotReservation.update({
          where: { id: res.id },
          data: {
            status: 'BOOKED',
            holdExpiresAt: null,
            requiresOperatorAction: false,
          },
        });
      }
    }

    // 6. Product Stock decrement fulfillment
    for (const orderItem of order.items) {
      const updateResult = await tx.$executeRaw`
        UPDATE "Item"
        SET stock = stock - ${orderItem.quantity}
        WHERE id = ${orderItem.itemId}
          AND stock IS NOT NULL
          AND stock >= ${orderItem.quantity}
      `;

      if (updateResult === 1) {
        await tx.orderItem.update({
          where: { id: orderItem.id },
          data: { stockDecremented: orderItem.quantity },
        });
      } else {
        const itemObj = await tx.item.findUnique({
          where: { id: orderItem.itemId },
          select: { itemType: true },
        });

        if (itemObj?.itemType === 'PRODUCT') {
          requiresOperatorAction = true;
          operatorActionReason = 'PAID_OUT_OF_STOCK';

          await tx.orderItem.update({
            where: { id: orderItem.id },
            data: { stockDecremented: 0 },
          });
          logger.warn('[PRODUCT_OUT_OF_STOCK_COLLISION]', {
            orderId: order.id,
            itemId: orderItem.itemId,
          });
        }
      }
    }

    // 7. Transition Order to PAID or PAID_REQUIRES_RESOLUTION
    await tx.order.update({
      where: { id: order.id },
      data: {
        status: targetOrderStatus,
        paymentMethod: provider,
        paymentRef: providerRef,
        requiresOperatorAction,
        operatorActionReason,
        refundStatus: targetRefundStatus,
      },
    });

    // 8. Transactional Alert Outbox if operator action is required
    if (requiresOperatorAction && operatorActionReason) {
      const alertTimestamp = now.toISOString();
      const alertEventId = `alert_${order.id}_${operatorActionReason}_${Date.now()}`;

      await tx.inboxEvent.create({
        data: {
          provider: 'SYSTEM_ALERT',
          eventId: alertEventId,
          kind: 'SYSTEM_ALERT',
          payloadJson: {
            version: 1,
            kind: 'SYSTEM_ALERT',
            orderId: order.id,
            reason: operatorActionReason,
            timestamp: alertTimestamp,
          },
          status: 'PENDING',
        },
      });
    }

    return { status: targetOrderStatus, requiresOperatorAction };
  });
}
