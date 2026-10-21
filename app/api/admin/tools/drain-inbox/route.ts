import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { processInboxEventRow } from '@/lib/jobs/inngest';
import { authenticateAdmin } from '@/lib/security/adminAuth';
import { logger } from '@/lib/telemetry/logger';

const WORKER_ID = `drain_api_${Date.now()}`;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = authenticateAdmin(req);
  if (!auth.authenticated) {
    return auth.errorResponse!;
  }

  try {
    const pendingEvents = await prisma.inboxEvent.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });

    logger.info(`[drain-inbox] Found ${pendingEvents.length} pending events`);

    let drained = 0;
    let failed = 0;
    const results: Array<{ id: string; kind: string; status: string; error?: string }> = [];

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
        logger.info(`[drain-inbox] Processing event ${eventRow.id} (kind: ${eventRow.kind})`);
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
        results.push({ id: eventRow.id, kind: eventRow.kind, status: 'SENT' });
        logger.info(`[drain-inbox] ✅ Event ${eventRow.id} sent successfully`);
      } catch (err: unknown) {
        logger.error(`[drain-inbox] ❌ Error processing event ${eventRow.id}:`, err);
        const errMsg = err instanceof Error ? err.message : String(err);
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
        results.push({ id: eventRow.id, kind: eventRow.kind, status: 'FAILED', error: errMsg });
      }
    }

    return NextResponse.json({
      message: 'Inbox drained',
      summary: { total: pendingEvents.length, drained, failed },
      results,
    });
  } catch (err: unknown) {
    logger.error('[drain-inbox] Fatal error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
