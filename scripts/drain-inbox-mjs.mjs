import { PrismaClient } from '@prisma/client';
import { processInboxEventRow } from '@/lib/jobs/inngest';

const prisma = new PrismaClient();
const WORKER_ID = `drain_manual_${Date.now()}`;

async function main() {
  console.log('[drain-inbox] Starting...');

  const pendingEvents = await prisma.inboxEvent.findMany({
    where: { status: 'PENDING' },
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
      console.log(`[drain-inbox] Processing event ${eventRow.id} (kind: ${eventRow.kind})`);
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
      console.log(`[drain-inbox] ✅ Event ${eventRow.id} sent successfully`);
    } catch (err: unknown) {
      console.error(`[drain-inbox] ❌ Error processing event ${eventRow.id}:`, err);
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
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('[drain-inbox] Fatal error:', err);
  process.exit(1);
});
