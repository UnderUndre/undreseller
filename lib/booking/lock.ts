import { prisma } from '@/lib/db/prisma';
import { acquireItemSlotLock } from './advisoryLock';

export class SlotConflictError extends Error {
  constructor(message = 'Slot is already reserved or held') {
    super(message);
    this.name = 'SlotConflictError';
  }
}

export interface CreateHoldParams {
  itemId: string;
  startTime: Date;
  customerName?: string | null;
  customerPhone?: string | null;
  customerEmail?: string | null;
  customerTgId?: string | null;
}

export interface HoldResult {
  order: {
    id: string;
    orderNumber: string;
    status: string;
    totalMinor: number;
    currency: string;
  };
  reservation: {
    id: string;
    startTime: string;
    endTime: string;
    status: string;
    holdExpiresAt: string;
  };
}

export async function createSlotHoldLock(params: CreateHoldParams): Promise<HoldResult> {
  const { itemId, startTime, customerName, customerPhone, customerEmail, customerTgId } = params;

  return await prisma.$transaction(async (tx) => {
    // 1. Transaction-level advisory lock on itemId
    await acquireItemSlotLock(tx, itemId);

    // 2. Fetch service item
    const item = await tx.item.findUnique({
      where: { id: itemId },
    });

    if (!item || !item.isActive || item.itemType !== 'SERVICE' || !item.durationMin) {
      throw new Error('Service item not found or unavailable');
    }

    const endTime = new Date(startTime.getTime() + item.durationMin * 60 * 1000);
    const now = new Date();
    const holdExpiresAt = new Date(now.getTime() + 15 * 60 * 1000); // 15-minute hold

    // 3. Release expired holds for this item
    const expiredReservations = await tx.slotReservation.findMany({
      where: {
        itemId,
        status: 'HELD',
        holdExpiresAt: { lte: now },
      },
      select: { id: true, orderId: true },
    });

    if (expiredReservations.length > 0) {
      const expiredIds = expiredReservations.map((r) => r.id);
      const expiredOrderIds = expiredReservations.map((r) => r.orderId);

      await tx.slotReservation.updateMany({
        where: { id: { in: expiredIds } },
        data: { status: 'RELEASED' },
      });

      await tx.order.updateMany({
        where: { id: { in: expiredOrderIds }, status: 'PENDING' },
        data: { status: 'CANCELLED' },
      });
    }

    // 4. Create PENDING Order
    const randomSuffix = Math.random().toString(36).substring(2, 8).toUpperCase();
    const orderNumber = `ORD-${Date.now()}-${randomSuffix}`;

    const order = await tx.order.create({
      data: {
        orderNumber,
        status: 'PENDING',
        totalMinor: item.priceMinor,
        currency: item.currency,
        customerName: customerName ?? null,
        customerPhone: customerPhone ?? null,
        customerEmail: customerEmail ?? null,
        customerTgId: customerTgId ?? null,
        items: {
          create: {
            itemId: item.id,
            quantity: 1,
            priceMinor: item.priceMinor,
            stockDecremented: 0,
          },
        },
      },
    });

    // 5. Insert HELD reservation
    try {
      const reservation = await tx.slotReservation.create({
        data: {
          itemId: item.id,
          orderId: order.id,
          startTime,
          endTime,
          status: 'HELD',
          holdExpiresAt,
        },
      });

      return {
        order: {
          id: order.id,
          orderNumber: order.orderNumber,
          status: order.status,
          totalMinor: order.totalMinor,
          currency: order.currency,
        },
        reservation: {
          id: reservation.id,
          startTime: reservation.startTime.toISOString(),
          endTime: reservation.endTime.toISOString(),
          status: reservation.status,
          holdExpiresAt: reservation.holdExpiresAt!.toISOString(),
        },
      };
    } catch (err: unknown) {
      // Map 23P01 (exclusion_violation) to SlotConflictError
      const errorStr = String(err);
      if (
        errorStr.includes('23P01') ||
        errorStr.includes('slot_no_overlap') ||
        errorStr.includes('exclusion constraint')
      ) {
        throw new SlotConflictError('Selected slot has just been taken by another customer');
      }
      throw err;
    }
  });
}
