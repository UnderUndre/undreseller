import { prisma } from '@/lib/db/prisma';
import { processInboxEventRow } from './inboxProcessor';
import { logger } from '@/lib/telemetry/logger';

const WORKER_ID = `poller_${process.pid}_${Math.random().toString(36).substring(2, 6)}`;
let pollerInterval: NodeJS.Timeout | null = null;
let isPolling = false;

async function pollInbox(): Promise<void> {
  if (isPolling) return;
  isPolling = true;

  let pendingEvents: Awaited<ReturnType<typeof prisma.inboxEvent.findMany>> | null = null;

  // Запрос к БД вынесен в отдельный try: сбой запроса логируется с деталями
  // и не рвёт весь цикл — следующий опрос сработает по расписанию.
  try {
    pendingEvents = await prisma.inboxEvent.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: 10, // Small batch
    });
  } catch (err: unknown) {
    logger.error('[inboxPoller] Query failed:', err);
    isPolling = false;
    return;
  }

  if (!pendingEvents || pendingEvents.length === 0) {
    isPolling = false;
    return;
  }

  logger.debug(`[inboxPoller] Found ${pendingEvents.length} pending events`);

  for (const eventRow of pendingEvents) {
    // Try to claim the event. Failure on one event must not kill the whole poll.
    let claimed = false;
    try {
      const updated = await prisma.inboxEvent.updateMany({
        where: {
          id: eventRow.id,
          status: 'PENDING',
        },
        data: {
          status: 'PROCESSING',
          lockedAt: new Date(),
          lockedBy: WORKER_ID,
        },
      });
      claimed = updated.count > 0;
    } catch (err: unknown) {
      logger.error(`[inboxPoller] Claim failed for event ${eventRow.id}:`, err);
      continue;
    }
    if (!claimed) continue; // Already locked by someone else

    try {
      logger.debug(`[inboxPoller] Processing event ${eventRow.id} (kind: ${eventRow.kind})`);
      await processInboxEventRow(eventRow);

      await prisma.inboxEvent.update({
        where: { id: eventRow.id },
        data: {
          status: 'SENT',
          lockedAt: null,
          lockedBy: null,
        },
      });
      logger.info(`[inboxPoller] Event ${eventRow.id} sent successfully`);
    } catch (err: unknown) {
      logger.error(`[inboxPoller] Error processing event ${eventRow.id}:`, err);
      const newAttemptCount = eventRow.attemptCount + 1;
      const isFailed = newAttemptCount >= 10;

      try {
        await prisma.inboxEvent.update({
          where: { id: eventRow.id },
          data: {
            status: isFailed ? 'FAILED' : 'PENDING',
            attemptCount: newAttemptCount,
            lastErrorAt: new Date(),
            lockedAt: null,
            lockedBy: null,
          },
        });
      } catch (updateErr: unknown) {
        logger.error(`[inboxPoller] Failed to update event ${eventRow.id} after error:`, updateErr);
      }
    }
  }

  isPolling = false;
}

export function startInboxPoller(): void {
  if (pollerInterval) return; // Already running

  logger.info('[inboxPoller] Starting background inbox poller (every 5 seconds)');

  // Initial poll
  pollInbox().catch((err) => logger.error('[inboxPoller] Initial poll failed:', err));

  // Poll every 5 seconds
  pollerInterval = setInterval(() => {
    pollInbox().catch((err) => logger.error('[inboxPoller] Poll failed:', err));
  }, 5000);
}

export function stopInboxPoller(): void {
  if (pollerInterval) {
    clearInterval(pollerInterval);
    pollerInterval = null;
    logger.info('[inboxPoller] Stopped');
  }
}

