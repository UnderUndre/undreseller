import { prisma } from '../lib/db/prisma';
import { processInboxEventRow } from '../lib/jobs/inngest';

const WORKER_ID = `drain_${process.pid}_${Date.now()}`;

export async function drainInbox(): Promise<{ drained: number; failed: number }> {
  console.log('[drain-inbox] Starting emergency offline inbox drain...');

  const pendingEvents = await prisma.inboxEvent.findMany({
    where: {
      status: 'PENDING',
    },
    orderBy: { createdAt: 'asc' },
    take: 100,
  });

  console.log(`[drain-inbox] Found ${pendingEvents.length} pending events`);
  let drained = 0;
  let failed = 0;

  for (const eventRow of pendingEvents) {
    const claim = await prisma.inboxEvent.updateMany({
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

    if (claim.count === 0) continue;

    try {
      await processInboxEventRow(eventRow);

      await prisma.inboxEvent.update({
        where: { id: eventRow.id },
        data: {
          status: 'SENT',
          lockedAt: null,
          lockedBy: null,
        },
      });
      drained++;
    } catch (err: unknown) {
      console.error(`[drain-inbox] Error processing event ${eventRow.id}:`, err);
      const newAttemptCount = eventRow.attemptCount + 1;
      const isFailed = newAttemptCount >= 10;

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
      failed++;
    }
  }

  console.log(`[drain-inbox] Completed: ${drained} drained, ${failed} failed`);
  return { drained, failed };
}

function isMainModule(): boolean {
  if (typeof require !== 'undefined' && typeof module !== 'undefined') {
    return require.main === module;
  }
  return Boolean(process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('/scripts/drain-inbox.ts'));
}

if (isMainModule()) {
  drainInbox()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[drain-inbox] Fatal error:', err);
      process.exit(1);
    });
}
