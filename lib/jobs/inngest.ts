import { Inngest } from 'inngest';
import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/telemetry/logger';
import { acquireResourceSlotLock, acquireItemSlotLock } from '@/lib/booking/advisoryLock';
import { sendWhatsAppTemplate } from '@/lib/bot/whatsappClient';
import { enqueueTelegramOutbox, OUTBOX_PRIORITY } from '@/lib/bot/telegramOutbox';
import { buildClientReminderKeyboard } from '@/lib/bot/clientConfirmation';
import { processInboxEventRow } from './inboxProcessor';
import {
  evaluateReminderWakeUpCas,
  evaluateAutoCancelWakeUpCas,
  evaluateInvoiceExpiryWakeUpCas,
  runPostgresDeadlineReconciliationSweeper,
} from './deadlineSweeper';

export const inngest = new Inngest({
  id: 'undreseller',
  eventKey: process.env.INNGEST_EVENT_KEY || undefined,
});

export const isInngestConfigured = Boolean(process.env.INNGEST_EVENT_KEY);

// Re-export for backward compatibility
export { processInboxEventRow };

const WORKER_ID = `worker_${process.pid}_${Math.random().toString(36).substring(2, 6)}`;

export const APPOINTMENT_REMINDER_CANCEL_ON = [
  { event: 'order/cancelled', match: 'data.orderId' },
  { event: 'order/client-declined', match: 'data.orderId' },
  { event: 'order/rescheduled', match: 'data.orderId' },
  { event: 'order/fulfilled', match: 'data.orderId' },
] as const;

export const AUTO_CANCEL_UNCONFIRMED_CANCEL_ON = [
  { event: 'order/cancelled', match: 'data.orderId' },
  { event: 'order/client-confirmed', match: 'data.orderId' },
  { event: 'order/rescheduled', match: 'data.orderId' },
  { event: 'order/fulfilled', match: 'data.orderId' },
] as const;

export const INVOICE_EXPIRY_CANCEL_ON = [
  { event: 'order/paid', match: 'data.orderId' },
  { event: 'order/cancelled', match: 'data.orderId' },
  { event: 'order/rescheduled', match: 'data.orderId' },
] as const;

// 1. Inbox Sweep cron job (every 1 minute)
export const inboxSweep = inngest.createFunction(
  {
    id: 'inbox-sweep',
    concurrency: { limit: 1 },
  },
  { cron: '*/1 * * * *' },
  async ({ step }) => {
    return await step.run('sweep-pending-and-expired-leases', async () => {
      const now = new Date();
      const pendingAge = new Date(now.getTime() - 15 * 1000);
      const leaseAge = new Date(now.getTime() - 5 * 60 * 1000);

      const candidates = await prisma.inboxEvent.findMany({
        where: {
          OR: [
            { status: 'PENDING', createdAt: { lte: pendingAge } },
            { status: 'PROCESSING', lockedAt: { lte: leaseAge } },
          ],
        },
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
        take: 50,
      });

      let processedCount = 0;
      for (const candidate of candidates) {
        const claimResult = await prisma.inboxEvent.updateMany({
          where: {
            id: candidate.id,
            OR: [
              { status: 'PENDING' },
              { status: 'PROCESSING', lockedAt: { lte: leaseAge } },
            ],
          },
          data: {
            status: 'PROCESSING',
            lockedAt: new Date(),
            lockedBy: WORKER_ID,
          },
        });

        if (claimResult.count === 0) continue;

        try {
          await processInboxEventRow(candidate);

          await prisma.inboxEvent.update({
            where: { id: candidate.id },
            data: {
              status: 'SENT',
              lockedAt: null,
              lockedBy: null,
            },
          });
          processedCount++;
        } catch (err: unknown) {
          logger.warn(`Inbox processing error for ${candidate.id}`, { error: String(err) });
          const newAttemptCount = candidate.attemptCount + 1;
          const isFinalFailure = newAttemptCount >= 10;

          if (isFinalFailure) {
            await prisma.inboxEvent.update({
              where: { id: candidate.id },
              data: {
                status: 'FAILED',
                attemptCount: newAttemptCount,
                lastErrorAt: new Date(),
                lockedAt: null,
                lockedBy: null,
              },
            });

            if (candidate.kind === 'SYSTEM_ALERT') {
              logger.error('[SYSTEM_ALERT_TERMINAL_FAILURE]', { eventId: candidate.id });
            } else {
              logger.error(`[INBOX_EVENT_TERMINAL_FAILURE] eventId=${candidate.id} attempts=${newAttemptCount}`);
            }
          } else {
            await prisma.inboxEvent.update({
              where: { id: candidate.id },
              data: {
                status: 'PENDING',
                attemptCount: newAttemptCount,
                lastErrorAt: new Date(),
                lockedAt: null,
                lockedBy: null,
              },
            });
          }
        }
      }

      return { candidatesCount: candidates.length, processedCount };
    });
  }
);

// 2. Knowledge Reindex function
export const documentReindex = inngest.createFunction(
  {
    id: 'document-reindex',
    concurrency: { limit: 1 },
  },
  { event: 'knowledge/reindex.requested' },
  async ({ step }) => {
    return await step.run('parse-and-index-chunks', async () => {
      const { executeKnowledgeReindex } = await import('@/lib/ai/documentParser');
      return await executeKnowledgeReindex();
    });
  }
);

// 3. Hold Sweep cron job (every 60s)
export const holdSweep = inngest.createFunction(
  {
    id: 'hold-sweep',
    concurrency: { limit: 1 },
  },
  { cron: '*/1 * * * *' },
  async ({ step }) => {
    return await step.run('release-expired-holds-and-reconcile-deadlines', async () => {
      const now = new Date();

      const expired = await prisma.slotReservation.findMany({
        where: {
          status: 'HELD',
          holdExpiresAt: { lte: now },
        },
        select: {
          id: true,
          resourceId: true,
          itemId: true,
          orderId: true,
        },
      });

      let releasedCount = 0;
      if (expired.length > 0) {
        const uniqueResources = Array.from(
          new Set(expired.map((r) => r.resourceId || 'default_master'))
        ).sort();

        for (const resourceId of uniqueResources) {
          await prisma.$transaction(async (tx) => {
            await acquireResourceSlotLock(tx, resourceId);

            const resExpired = expired.filter(
              (r) => (r.resourceId || 'default_master') === resourceId
            );
            const reservationIds = resExpired.map((r) => r.id);
            const orderIds = resExpired.map((r) => r.orderId);

            for (const item of resExpired) {
              if (item.itemId) {
                await acquireItemSlotLock(tx, item.itemId);
              }
            }

            await tx.slotReservation.updateMany({
              where: {
                id: { in: reservationIds },
                status: 'HELD',
                holdExpiresAt: { lte: now },
              },
              data: { status: 'RELEASED' },
            });

            await tx.order.updateMany({
              where: {
                id: { in: orderIds },
                status: 'PENDING',
              },
              data: { status: 'CANCELLED' },
            });

            releasedCount += resExpired.length;
          });

          logger.counter('hold_expired');
        }
      }

      // Also run independent PostgreSQL deadline reconciliation sweeper (T-110c)
      const deadlineSweep = await runPostgresDeadlineReconciliationSweeper(now);

      return { expiredCount: releasedCount, deadlineSweep };
    });
  }
);

// 4. Nightly Purge cron job (every night at 03:00) - includes customerNotes & Telegram GDPR redaction
export const nightlyPurge = inngest.createFunction(
  {
    id: 'nightly-purge',
    concurrency: { limit: 1 },
  },
  { cron: '0 3 * * *' },
  async ({ step }) => {
    return await step.run('purge-pii-and-terminal-inbox', async () => {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const orders30d = await prisma.order.updateMany({
        where: {
          status: { in: ['CANCELLED', 'FULFILLED'] },
          updatedAt: { lte: thirtyDaysAgo },
        },
        data: {
          customerName: null,
          customerPhone: null,
          customerEmail: null,
          customerNotes: null,
        },
      });

      const tickets30d = await prisma.escalationTicket.updateMany({
        where: {
          createdAt: { lte: thirtyDaysAgo },
        },
        data: {
          queryText: null,
        },
      });

      const tgId90d = await prisma.order.updateMany({
        where: {
          createdAt: { lte: ninetyDaysAgo },
          customerTgId: { not: null },
        },
        data: {
          customerTgId: null,
        },
      });

      const inboxScrub7d = await prisma.inboxEvent.updateMany({
        where: {
          status: { in: ['SENT', 'FAILED'] },
          createdAt: { lte: sevenDaysAgo },
        },
        data: {
          payloadJson: {},
        },
      });

      logger.info(
        `Nightly purge completed: orders=${orders30d.count} tickets=${tickets30d.count} tgIds=${tgId90d.count} inboxScrubbed=${inboxScrub7d.count}`
      );

      return {
        scrubbedOrders: orders30d.count,
        scrubbedTickets: tickets30d.count,
        scrubbedTgIds: tgId90d.count,
        scrubbedInboxPayloads: inboxScrub7d.count,
      };
    });
  }
);

// 5. Omnichannel Client Appointment Reminder Job (T-108) - strictly 4 cancelOn triggers
export const appointmentReminderJob = inngest.createFunction(
  {
    id: 'appointment-reminder-job',
    cancelOn: [...APPOINTMENT_REMINDER_CANCEL_ON],
  },
  { event: 'order/staff-approved' },
  async ({ event, step }) => {
    const orderId = String(event.data.orderId);
    const expectedScheduleVersion = Number(event.data.scheduleVersion || 1);

    const scheduleInfo = await step.run('load-reminder-schedule', async () => {
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: { reservation: true },
      });
      const settings = await prisma.shopSettings.findUnique({ where: { id: 1 } });

      if (!order || !order.reservation) return null;

      const noticeHours = settings?.confirmationNoticeHours ?? 24;
      const wakeUpAt = new Date(
        order.reservation.startTime.getTime() - noticeHours * 60 * 60 * 1000
      );
      return {
        wakeUpAtIso: wakeUpAt.toISOString(),
        whatsappTemplateName: settings?.whatsappTemplateName || 'appointment_confirmation',
      };
    });

    if (!scheduleInfo) {
      return { status: 'ORDER_NOT_FOUND' };
    }

    await step.sleepUntil('sleep-until-reminder-window', scheduleInfo.wakeUpAtIso);

    return await step.run('cas-verify-and-dispatch-reminder', async () => {
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: { reservation: true },
      });

      if (!order || !order.reservation) {
        return { status: 'ORDER_MISSING_ON_WAKEUP' };
      }

      const evaluation = evaluateReminderWakeUpCas({
        order: {
          id: order.id,
          orderNumber: order.orderNumber,
          status: order.status as never,
          confirmationStatus: order.confirmationStatus as never,
          cancellationReason: order.cancellationReason,
          autoCancelOnNoConfirmation: order.autoCancelOnNoConfirmation,
          scheduleVersion: order.scheduleVersion,
          startTime: order.reservation.startTime,
          invoiceExpiresAt: order.invoiceExpiresAt,
          reminderSentAt: order.reminderSentAt,
          reservationStatus: order.reservation.status as never,
          customerTgId: order.customerTgId,
          customerPhone: order.customerPhone,
        },
        expectedScheduleVersion,
      });

      if (
        evaluation.action === 'STALE_VERSION_NO_OP' ||
        evaluation.action === 'INACTIVE_STATUS_NO_OP'
      ) {
        return { status: evaluation.action };
      }

      const cas = await prisma.order.updateMany({
        where: {
          id: order.id,
          scheduleVersion: expectedScheduleVersion,
          reminderSentAt: null,
        },
        data: {
          reminderSentAt: new Date(),
        },
      });

      if (cas.count === 0) {
        return { status: 'CAS_ALREADY_SENT' };
      }

      if (evaluation.action === 'DISPATCH_TELEGRAM' && order.customerTgId) {
        await enqueueTelegramOutbox({
          botProfile: 'CLIENT_BOT',
          chatId: order.customerTgId,
          priority: OUTBOX_PRIORITY.HIGH_STAFF_PAGER,
          dedupeKey: `reminder_tg_${order.id}_v${expectedScheduleVersion}`,
          action: 'sendMessage',
          text: `🔔 Напоминаем о вашей записи #${order.orderNumber} (${order.reservation.startTime.toISOString()}). Пожалуйста, подтвердите визит:`,
          replyMarkup: buildClientReminderKeyboard(order.id),
          orderId: order.id,
        });
        return { status: 'DISPATCHED_TELEGRAM' };
      }

      if (order.customerPhone) {
        await sendWhatsAppTemplate({
          toPhone: order.customerPhone,
          templateName: scheduleInfo.whatsappTemplateName,
        });
        return { status: 'DISPATCHED_WHATSAPP' };
      }

      return { status: 'NO_CHANNEL_AVAILABLE' };
    });
  }
);

// 6. Smart Auto-Cancellation Job for Unconfirmed New Clients (T-110) - strictly 4 cancelOn triggers
export const autoCancelUnconfirmedJob = inngest.createFunction(
  {
    id: 'auto-cancel-unconfirmed-job',
    cancelOn: [...AUTO_CANCEL_UNCONFIRMED_CANCEL_ON],
  },
  { event: 'order/staff-approved' },
  async ({ event, step }) => {
    const orderId = String(event.data.orderId);
    const expectedScheduleVersion = Number(event.data.scheduleVersion || 1);

    const scheduleInfo = await step.run('load-autocancel-deadline', async () => {
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: { reservation: true },
      });
      const settings = await prisma.shopSettings.findUnique({ where: { id: 1 } });

      if (!order || !order.reservation) return null;

      const deadlineHours = settings?.autoCancelDeadlineHours ?? 6;
      const wakeUpAt = new Date(
        order.reservation.startTime.getTime() - deadlineHours * 60 * 60 * 1000
      );
      return {
        wakeUpAtIso: wakeUpAt.toISOString(),
        staffChatId:
          order.staffChatId || settings?.staffDestinationChatId || process.env.STAFF_CHAT_ID || null,
      };
    });

    if (!scheduleInfo) {
      return { status: 'ORDER_NOT_FOUND' };
    }

    await step.sleepUntil('sleep-until-autocancel-deadline', scheduleInfo.wakeUpAtIso);

    return await step.run('cas-verify-and-autocancel-new-client', async () => {
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: { reservation: true },
      });

      if (!order || !order.reservation) {
        return { status: 'ORDER_MISSING_ON_WAKEUP' };
      }

      const evaluation = evaluateAutoCancelWakeUpCas({
        order: {
          id: order.id,
          orderNumber: order.orderNumber,
          status: order.status as never,
          confirmationStatus: order.confirmationStatus as never,
          cancellationReason: order.cancellationReason,
          autoCancelOnNoConfirmation: order.autoCancelOnNoConfirmation,
          scheduleVersion: order.scheduleVersion,
          startTime: order.reservation.startTime,
          invoiceExpiresAt: order.invoiceExpiresAt,
          reminderSentAt: order.reminderSentAt,
          reservationStatus: order.reservation.status as never,
          customerTgId: order.customerTgId,
          customerPhone: order.customerPhone,
        },
        expectedScheduleVersion,
      });

      if (
        evaluation.action === 'STALE_VERSION_NO_OP' ||
        evaluation.action === 'ALREADY_CONFIRMED_OR_TERMINAL_NO_OP'
      ) {
        return { status: evaluation.action };
      }

      if (evaluation.action === 'PRESERVED_REGULAR_CLIENT') {
        if (scheduleInfo.staffChatId && evaluation.staffAlertText) {
          await enqueueTelegramOutbox({
            botProfile: 'STAFF_BOT',
            chatId: scheduleInfo.staffChatId,
            priority: OUTBOX_PRIORITY.HIGH_STAFF_PAGER,
            dedupeKey: `regular_silent_alert_${order.id}_v${expectedScheduleVersion}`,
            action: 'sendMessage',
            text: evaluation.staffAlertText,
            orderId: order.id,
          });
        }
        return { status: 'PRESERVED_REGULAR_CLIENT' };
      }

      // New client unconfirmed -> atomic CAS cancellation and slot release
      const applied = await prisma.$transaction(async (tx) => {
        const cas = await tx.order.updateMany({
          where: {
            id: order.id,
            scheduleVersion: expectedScheduleVersion,
            status: { in: ['PENDING', 'PAID'] },
            confirmationStatus: 'STAFF_APPROVED',
          },
          data: {
            status: 'CANCELLED',
            cancellationReason: 'AUTO_CANCELLED_NO_CONFIRMATION',
            scheduleVersion: evaluation.updatedOrder.scheduleVersion,
          },
        });

        if (cas.count === 0) return false;

        await tx.slotReservation.update({
          where: { id: order.reservation!.id },
          data: { status: 'RELEASED' },
        });
        return true;
      });

      if (!applied) {
        return { status: 'CAS_RACE_LOST' };
      }

      if (scheduleInfo.staffChatId && evaluation.staffAlertText) {
        await enqueueTelegramOutbox({
          botProfile: 'STAFF_BOT',
          chatId: scheduleInfo.staffChatId,
          priority: OUTBOX_PRIORITY.HIGH_STAFF_PAGER,
          dedupeKey: `autocancel_staff_alert_${order.id}`,
          action: 'sendMessage',
          text: evaluation.staffAlertText,
          orderId: order.id,
        });

        // GDPR redaction отключено: контакты клиента должны оставаться видимыми мастерам.
      }

      if (order.customerTgId) {
        await enqueueTelegramOutbox({
          botProfile: 'CLIENT_BOT',
          chatId: order.customerTgId,
          priority: OUTBOX_PRIORITY.NORMAL_NOTIFICATION,
          dedupeKey: `autocancel_client_notice_${order.id}`,
          action: 'sendMessage',
          text: `⏰ Запись #${order.orderNumber} была автоматически отменена, так как мы не получили подтверждения визита.`,
          orderId: order.id,
        });
      }

      return { status: 'AUTO_CANCELLED_NEW_CLIENT' };
    });
  }
);

// 7. 15-Minute Delayed Invoice Expiry Job (T-110b) - strictly 3 cancelOn triggers
export const invoiceExpiryJob = inngest.createFunction(
  {
    id: 'invoice-expiry-job',
    cancelOn: [...INVOICE_EXPIRY_CANCEL_ON],
  },
  { event: 'order/staff-approved' },
  async ({ event, step }) => {
    const orderId = String(event.data.orderId);
    const expectedScheduleVersion = Number(event.data.scheduleVersion || 1);

    const invoiceMeta = await step.run('check-awaiting-payment-window', async () => {
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: { reservation: true },
      });

      if (!order || order.status !== 'AWAITING_PAYMENT' || !order.invoiceExpiresAt) {
        return null;
      }

      return {
        expiresAtIso: order.invoiceExpiresAt.toISOString(),
        staffChatId: order.staffChatId,
      };
    });

    if (!invoiceMeta) {
      return { status: 'NOT_AWAITING_PAYMENT' };
    }

    await step.sleepUntil('sleep-15m-invoice-window', invoiceMeta.expiresAtIso);

    return await step.run('cas-expire-unpaid-invoice', async () => {
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: { reservation: true },
      });

      if (!order || !order.reservation) {
        return { status: 'ORDER_MISSING' };
      }

      const evaluation = evaluateInvoiceExpiryWakeUpCas({
        order: {
          id: order.id,
          orderNumber: order.orderNumber,
          status: order.status as never,
          confirmationStatus: order.confirmationStatus as never,
          cancellationReason: order.cancellationReason,
          autoCancelOnNoConfirmation: order.autoCancelOnNoConfirmation,
          scheduleVersion: order.scheduleVersion,
          startTime: order.reservation.startTime,
          invoiceExpiresAt: order.invoiceExpiresAt,
          reminderSentAt: order.reminderSentAt,
          reservationStatus: order.reservation.status as never,
        },
        expectedScheduleVersion,
      });

      if (evaluation.action === 'STALE_OR_ALREADY_PAID_NO_OP') {
        return { status: evaluation.action };
      }

      const applied = await prisma.$transaction(async (tx) => {
        const cas = await tx.order.updateMany({
          where: {
            id: order.id,
            status: 'AWAITING_PAYMENT',
            scheduleVersion: expectedScheduleVersion,
          },
          data: {
            status: 'PAYMENT_EXPIRED',
            cancellationReason: 'PAYMENT_EXPIRED',
            scheduleVersion: evaluation.updatedOrder.scheduleVersion,
          },
        });

        if (cas.count === 0) return false;

        await tx.slotReservation.update({
          where: { id: order.reservation!.id },
          data: { status: 'RELEASED' },
        });

        return true;
      });

      if (!applied) {
        return { status: 'CAS_RACE_LOST' };
      }

      if (order.customerTgId) {
        await enqueueTelegramOutbox({
          botProfile: 'CLIENT_BOT',
          chatId: order.customerTgId,
          priority: OUTBOX_PRIORITY.NORMAL_NOTIFICATION,
          dedupeKey: `invoice_expired_client_${order.id}`,
          action: 'sendMessage',
          text: `⌛ Время на оплату счёта по заказу #${order.orderNumber} (15 минут) истекло. Слот освобождён.`,
          orderId: order.id,
        });
      }

      return { status: 'EXPIRED_RELEASED' };
    });
  }
);
