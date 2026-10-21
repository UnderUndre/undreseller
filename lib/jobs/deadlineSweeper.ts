import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/telemetry/logger';

export const DEADLINE_LAG_ALERT_THRESHOLD_MS = 120 * 1000; // 2 minutes lag alert threshold

export interface LifecycleOrderSnapshot {
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
  confirmationStatus:
    | 'PENDING_STAFF_REVIEW'
    | 'STAFF_APPROVED'
    | 'CLIENT_CONFIRMED'
    | 'RESCHEDULE_OFFERED';
  cancellationReason: string | null;
  autoCancelOnNoConfirmation: boolean;
  scheduleVersion: number;
  startTime: Date;
  invoiceExpiresAt: Date | null;
  reminderSentAt: Date | null;
  reservationStatus: 'HELD' | 'BOOKED' | 'RELEASED';
  customerTgId?: string | null;
  customerPhone?: string | null;
}

export function evaluateReminderWakeUpCas(params: {
  order: LifecycleOrderSnapshot;
  expectedScheduleVersion: number;
  now?: Date;
}): {
  action: 'DISPATCH_TELEGRAM' | 'DISPATCH_WHATSAPP' | 'STALE_VERSION_NO_OP' | 'INACTIVE_STATUS_NO_OP';
  updatedOrder: LifecycleOrderSnapshot;
} {
  const { order, expectedScheduleVersion, now = new Date() } = params;

  if (order.scheduleVersion !== expectedScheduleVersion) {
    return { action: 'STALE_VERSION_NO_OP', updatedOrder: order };
  }

  if (
    (order.status !== 'PENDING' && order.status !== 'PAID') ||
    order.confirmationStatus !== 'STAFF_APPROVED' ||
    order.reminderSentAt !== null
  ) {
    return { action: 'INACTIVE_STATUS_NO_OP', updatedOrder: order };
  }

  const updated: LifecycleOrderSnapshot = {
    ...order,
    reminderSentAt: now,
  };

  if (order.customerTgId) {
    return { action: 'DISPATCH_TELEGRAM', updatedOrder: updated };
  }

  return { action: 'DISPATCH_WHATSAPP', updatedOrder: updated };
}

export function evaluateAutoCancelWakeUpCas(params: {
  order: LifecycleOrderSnapshot;
  expectedScheduleVersion: number;
}): {
  action:
    | 'AUTO_CANCELLED_NEW_CLIENT'
    | 'PRESERVED_REGULAR_CLIENT'
    | 'STALE_VERSION_NO_OP'
    | 'ALREADY_CONFIRMED_OR_TERMINAL_NO_OP';
  updatedOrder: LifecycleOrderSnapshot;
  staffAlertText?: string;
} {
  const { order, expectedScheduleVersion } = params;

  if (order.scheduleVersion !== expectedScheduleVersion) {
    return { action: 'STALE_VERSION_NO_OP', updatedOrder: order };
  }

  if (
    (order.status !== 'PENDING' && order.status !== 'PAID') ||
    order.confirmationStatus !== 'STAFF_APPROVED'
  ) {
    return { action: 'ALREADY_CONFIRMED_OR_TERMINAL_NO_OP', updatedOrder: order };
  }

  if (order.autoCancelOnNoConfirmation) {
    const updated: LifecycleOrderSnapshot = {
      ...order,
      status: 'CANCELLED',
      cancellationReason: 'AUTO_CANCELLED_NO_CONFIRMATION',
      reservationStatus: 'RELEASED',
      scheduleVersion: order.scheduleVersion + 1,
    };
    return {
      action: 'AUTO_CANCELLED_NEW_CLIENT',
      updatedOrder: updated,
      staffAlertText: `⏰ Автоотмена: новый клиент не подтвердил запись #${order.orderNumber} до дедлайна. Слот освобождён.`,
    };
  }

  return {
    action: 'PRESERVED_REGULAR_CLIENT',
    updatedOrder: order,
    staffAlertText: `⚠️ Клиент не ответил на напоминание (бронь сохранена) — заказ #${order.orderNumber}.`,
  };
}

export function evaluateInvoiceExpiryWakeUpCas(params: {
  order: LifecycleOrderSnapshot;
  expectedScheduleVersion: number;
}): {
  action: 'EXPIRED_RELEASED' | 'STALE_OR_ALREADY_PAID_NO_OP';
  updatedOrder: LifecycleOrderSnapshot;
} {
  const { order, expectedScheduleVersion } = params;

  if (
    order.scheduleVersion !== expectedScheduleVersion ||
    order.status !== 'AWAITING_PAYMENT'
  ) {
    return { action: 'STALE_OR_ALREADY_PAID_NO_OP', updatedOrder: order };
  }

  const updated: LifecycleOrderSnapshot = {
    ...order,
    status: 'PAYMENT_EXPIRED',
    cancellationReason: 'PAYMENT_EXPIRED',
    reservationStatus: 'RELEASED',
    scheduleVersion: order.scheduleVersion + 1,
  };

  return { action: 'EXPIRED_RELEASED', updatedOrder: updated };
}

export interface DeadlineSweeperRunResult {
  reconciledReminders: number;
  reconciledAutoCancels: number;
  reconciledInvoiceExpiries: number;
  oldestOverdueLagMs: number;
  lagAlertTriggered: boolean;
}

export function runDeadlineSweeperInMemory(params: {
  orders: LifecycleOrderSnapshot[];
  confirmationNoticeHours: number;
  autoCancelDeadlineHours: number;
  now: Date;
}): DeadlineSweeperRunResult {
  const { orders, confirmationNoticeHours, autoCancelDeadlineHours, now } = params;

  let reconciledReminders = 0;
  let reconciledAutoCancels = 0;
  let reconciledInvoiceExpiries = 0;
  let oldestOverdueLagMs = 0;

  for (let i = 0; i < orders.length; i++) {
    const ord = orders[i];

    // 1. Overdue invoice expiry check
    if (
      ord.status === 'AWAITING_PAYMENT' &&
      ord.invoiceExpiresAt &&
      ord.invoiceExpiresAt.getTime() <= now.getTime()
    ) {
      const lag = now.getTime() - ord.invoiceExpiresAt.getTime();
      if (lag > oldestOverdueLagMs) oldestOverdueLagMs = lag;

      const res = evaluateInvoiceExpiryWakeUpCas({
        order: ord,
        expectedScheduleVersion: ord.scheduleVersion,
      });
      if (res.action === 'EXPIRED_RELEASED') {
        orders[i] = res.updatedOrder;
        reconciledInvoiceExpiries++;
      }
      continue;
    }

    // 2. Overdue auto-cancel deadline check
    const autoCancelDueMs =
      ord.startTime.getTime() - autoCancelDeadlineHours * 60 * 60 * 1000;
    if (
      (ord.status === 'PENDING' || ord.status === 'PAID') &&
      ord.confirmationStatus === 'STAFF_APPROVED' &&
      autoCancelDueMs <= now.getTime()
    ) {
      const lag = now.getTime() - autoCancelDueMs;
      if (lag > oldestOverdueLagMs) oldestOverdueLagMs = lag;

      const res = evaluateAutoCancelWakeUpCas({
        order: ord,
        expectedScheduleVersion: ord.scheduleVersion,
      });
      if (res.action === 'AUTO_CANCELLED_NEW_CLIENT') {
        orders[i] = res.updatedOrder;
        reconciledAutoCancels++;
        continue;
      }
    }

    // 3. Overdue reminder check
    const reminderDueMs =
      ord.startTime.getTime() - confirmationNoticeHours * 60 * 60 * 1000;
    if (
      (ord.status === 'PENDING' || ord.status === 'PAID') &&
      ord.confirmationStatus === 'STAFF_APPROVED' &&
      ord.reminderSentAt === null &&
      reminderDueMs <= now.getTime()
    ) {
      const lag = now.getTime() - reminderDueMs;
      if (lag > oldestOverdueLagMs) oldestOverdueLagMs = lag;

      const res = evaluateReminderWakeUpCas({
        order: ord,
        expectedScheduleVersion: ord.scheduleVersion,
        now,
      });
      if (res.action === 'DISPATCH_TELEGRAM' || res.action === 'DISPATCH_WHATSAPP') {
        orders[i] = res.updatedOrder;
        reconciledReminders++;
      }
    }
  }

  const lagAlertTriggered = oldestOverdueLagMs > DEADLINE_LAG_ALERT_THRESHOLD_MS;
  if (lagAlertTriggered) {
    logger.warn('[DEADLINE_SWEEPER_LAG_ALERT]', {
      oldestOverdueLagMs,
      reconciledReminders,
      reconciledAutoCancels,
      reconciledInvoiceExpiries,
    });
  }

  return {
    reconciledReminders,
    reconciledAutoCancels,
    reconciledInvoiceExpiries,
    oldestOverdueLagMs,
    lagAlertTriggered,
  };
}

export async function runPostgresDeadlineReconciliationSweeper(
  now = new Date()
): Promise<DeadlineSweeperRunResult> {
  const settings = await prisma.shopSettings.findUnique({ where: { id: 1 } });
  const confirmationNoticeHours = settings?.confirmationNoticeHours ?? 24;
  const autoCancelDeadlineHours = settings?.autoCancelDeadlineHours ?? 6;

  const activeOrders = await prisma.order.findMany({
    where: {
      OR: [
        { status: 'AWAITING_PAYMENT', invoiceExpiresAt: { lte: now } },
        {
          status: { in: ['PENDING', 'PAID'] },
          confirmationStatus: 'STAFF_APPROVED',
        },
      ],
    },
    include: { reservation: true },
    take: 100,
  });

  const snapshots: LifecycleOrderSnapshot[] = activeOrders
    .filter((o) => Boolean(o.reservation))
    .map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      status: o.status as LifecycleOrderSnapshot['status'],
      confirmationStatus: o.confirmationStatus as LifecycleOrderSnapshot['confirmationStatus'],
      cancellationReason: o.cancellationReason,
      autoCancelOnNoConfirmation: o.autoCancelOnNoConfirmation,
      scheduleVersion: o.scheduleVersion,
      startTime: o.reservation!.startTime,
      invoiceExpiresAt: o.invoiceExpiresAt,
      reminderSentAt: o.reminderSentAt,
      reservationStatus: o.reservation!.status as 'HELD' | 'BOOKED' | 'RELEASED',
      customerTgId: o.customerTgId,
      customerPhone: o.customerPhone,
    }));

  const originalVersions = new Map(snapshots.map((s) => [s.id, s.scheduleVersion]));
  const originalReminderSent = new Map(snapshots.map((s) => [s.id, s.reminderSentAt]));

  const summary = runDeadlineSweeperInMemory({
    orders: snapshots,
    confirmationNoticeHours,
    autoCancelDeadlineHours,
    now,
  });

  for (const snap of snapshots) {
    const prevVer = originalVersions.get(snap.id);
    const prevRem = originalReminderSent.get(snap.id);
    if (snap.scheduleVersion !== prevVer || snap.reminderSentAt !== prevRem) {
      await prisma.$transaction(async (tx) => {
        const cas = await tx.order.updateMany({
          where: { id: snap.id, scheduleVersion: prevVer },
          data: {
            status: snap.status as never,
            cancellationReason: snap.cancellationReason as never,
            scheduleVersion: snap.scheduleVersion,
            reminderSentAt: snap.reminderSentAt,
          },
        });
        if (cas.count === 1) {
          await tx.slotReservation.updateMany({
            where: { orderId: snap.id },
            data: { status: snap.reservationStatus },
          });
        }
      });
    }
  }

  return summary;
}
