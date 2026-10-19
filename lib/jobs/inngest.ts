import { Inngest } from 'inngest';
import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/telemetry/logger';
import { acquireItemSlotLock } from '@/lib/booking/advisoryLock';

export const inngest = new Inngest({ id: 'undreseller' });

const WORKER_ID = `worker_${process.pid}_${Math.random().toString(36).substring(2, 6)}`;

export async function processInboxEventRow(eventRow: {
  id: string;
  kind: string;
  payloadJson: unknown;
  attemptCount: number;
}): Promise<void> {
  const payload = eventRow.payloadJson as Record<string, unknown>;
  logger.info(`Processing inbox event ${eventRow.id} of kind ${eventRow.kind}`);

  switch (eventRow.kind) {
    case 'SYSTEM_ALERT': {
      console.log(`[ALERT_DISPATCH] orderId=${payload.orderId} reason=${payload.reason}`);
      break;
    }
    case 'TELEGRAM_UPDATE': {
      logger.info(`[TELEGRAM_DISPATCH] chatId=${payload.chatId}`);
      break;
    }
    case 'WHATSAPP_MESSAGE': {
      logger.info(`[WHATSAPP_DISPATCH] phone=${payload.phone}`);
      break;
    }
    case 'NOWPAYMENTS_WEBHOOK': {
      logger.info(`[CRYPTO_DISPATCH] orderId=${payload.orderId}`);
      break;
    }
    default:
      logger.warn(`Unknown event kind: ${eventRow.kind}`);
  }
}

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

// 3. Hold Sweep cron job (every 60s) - T-027
export const holdSweep = inngest.createFunction(
  {
    id: 'hold-sweep',
    concurrency: { limit: 1 },
  },
  { cron: '*/1 * * * *' },
  async ({ step }) => {
    return await step.run('release-expired-holds', async () => {
      const now = new Date();

      const expired = await prisma.slotReservation.findMany({
        where: {
          status: 'HELD',
          holdExpiresAt: { lte: now },
        },
        select: {
          id: true,
          itemId: true,
          orderId: true,
        },
      });

      if (expired.length === 0) {
        return { expiredCount: 0 };
      }

      const uniqueItemIds = Array.from(new Set(expired.map((r) => r.itemId))).sort();
      let releasedCount = 0;

      for (const itemId of uniqueItemIds) {
        await prisma.$transaction(async (tx) => {
          await acquireItemSlotLock(tx, itemId);

          const itemExpired = expired.filter((r) => r.itemId === itemId);
          const reservationIds = itemExpired.map((r) => r.id);
          const orderIds = itemExpired.map((r) => r.orderId);

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

          releasedCount += itemExpired.length;
        });

        logger.counter('hold_expired');
      }

      logger.info(`Hold sweep released ${releasedCount} expired reservations`);
      return { expiredCount: releasedCount };
    });
  }
);

// 4. Nightly Purge cron job (every night at 03:00) - T-031
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
