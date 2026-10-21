import { prisma } from '../lib/db/prisma';
import { logger } from '../lib/telemetry/logger';

export interface BackfillBatchItem {
  id: string;
  resourceId: string | null;
  totalDurationMin: number | null;
  startTime: Date;
  endTime: Date;
  status: string;
}

export interface BackfillSummary {
  batchesProcessed: number;
  rowsUpdated: number;
  quarantinedCount: number;
  shadowMismatchCount: number;
  completed: boolean;
}

export function computeBackfillRow(row: BackfillBatchItem): {
  resourceId: string;
  totalDurationMin: number;
  quarantineReason: string | null;
  rawMinutes: number;
} {
  const diffMs = row.endTime.getTime() - row.startTime.getTime();
  const rawMinutes = diffMs / 60000;
  let quarantineReason: string | null = null;

  if (diffMs <= 0) {
    quarantineReason = 'NON_POSITIVE_INTERVAL';
  } else if (rawMinutes > 480) {
    quarantineReason = 'EXCEEDS_MAX_DURATION_480M';
  } else if (diffMs % 60000 !== 0) {
    quarantineReason = 'NON_WHOLE_MINUTE_INTERVAL';
  }

  const clampedMinutes = Math.max(1, Math.min(480, Math.round(rawMinutes)));
  return {
    resourceId: row.resourceId || 'default_master',
    totalDurationMin: clampedMinutes,
    quarantineReason,
    rawMinutes,
  };
}

export function detectResourceOverlapCollisions(
  reservations: Array<{
    id: string;
    resourceId: string;
    startTime: Date;
    endTime: Date;
    status: string;
  }>
): Array<{ r1Id: string; r2Id: string; resourceId: string }> {
  const active = reservations
    .filter((r) => r.status === 'HELD' || r.status === 'BOOKED')
    .sort((a, b) => a.id.localeCompare(b.id));

  const collisions: Array<{ r1Id: string; r2Id: string; resourceId: string }> = [];
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const r1 = active[i];
      const r2 = active[j];
      // Strictly enforce r1.id < r2.id
      if (r1.id < r2.id && r1.resourceId === r2.resourceId) {
        const overlaps =
          Math.max(r1.startTime.getTime(), r2.startTime.getTime()) <
          Math.min(r1.endTime.getTime(), r2.endTime.getTime());
        if (overlaps) {
          collisions.push({ r1Id: r1.id, r2Id: r2.id, resourceId: r1.resourceId });
        }
      }
    }
  }
  return collisions;
}

export async function runResumableBackfill(batchSize = 500, maxBatches = 100): Promise<BackfillSummary> {
  let batchesProcessed = 0;
  let rowsUpdated = 0;
  let quarantinedCount = 0;

  while (batchesProcessed < maxBatches) {
    const candidates = await prisma.slotReservation.findMany({
      where: {
        OR: [{ totalDurationMin: { lte: 0 } }],
      },
      orderBy: { id: 'asc' },
      take: batchSize,
    });

    if (candidates.length === 0) {
      break;
    }

    batchesProcessed++;
    for (const row of candidates) {
      const computed = computeBackfillRow({
        id: row.id,
        resourceId: row.resourceId,
        totalDurationMin: row.totalDurationMin,
        startTime: row.startTime,
        endTime: row.endTime,
        status: row.status,
      });

      if (computed.quarantineReason) {
        quarantinedCount++;
        logger.warn('[BACKFILL_QUARANTINE_ROW]', {
          reservationId: row.id,
          reason: computed.quarantineReason,
          rawMinutes: computed.rawMinutes,
        });
      }

      await prisma.slotReservation.update({
        where: { id: row.id },
        data: {
          resourceId: computed.resourceId,
          totalDurationMin: computed.totalDurationMin,
        },
      });
      rowsUpdated++;
    }
  }

  const remaining = await prisma.slotReservation.count({
    where: { totalDurationMin: { lte: 0 } },
  });

  return {
    batchesProcessed,
    rowsUpdated,
    quarantinedCount,
    shadowMismatchCount: remaining,
    completed: remaining === 0,
  };
}
