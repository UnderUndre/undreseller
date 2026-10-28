/**
 * Waitlist stats API (T072, US5, FR-422): admin outcome counters — offers by
 * status and entries by status. `recoveredSlots` = claimed offers (upper bound
 * of slots recovered via waitlist).
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { authenticateStaff } from '@/lib/security/staffAuth';
import { logger } from '@/lib/telemetry/logger';

const OFFER_STATUSES = ['SENT', 'CLAIMED', 'TAKEN', 'EXPIRED'] as const;
const ENTRY_STATUSES = ['ACTIVE', 'NOTIFIED', 'FULFILLED', 'EXPIRED', 'CANCELLED'] as const;

function zeroFilledCounts(
  rows: { status: string; _count: { _all: number } }[],
  statuses: readonly string[]
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const status of statuses) counts[status] = 0;
  for (const row of rows) {
    if (counts[row.status] !== undefined) counts[row.status] = row._count._all;
  }
  return counts;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await authenticateStaff(req, 'PERFORMER');
  if (!auth.authenticated) return auth.errorResponse!;

  try {
    const [offerRows, entryRows] = await Promise.all([
      prisma.waitlistOffer.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.waitlistEntry.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);

    const offers = zeroFilledCounts(offerRows, OFFER_STATUSES);
    const entries = zeroFilledCounts(entryRows, ENTRY_STATUSES);

    return NextResponse.json({
      offers,
      entries,
      recoveredSlots: offers.CLAIMED,
      offersSent: offers.SENT + offers.CLAIMED + offers.TAKEN + offers.EXPIRED,
    });
  } catch (err: unknown) {
    logger.error('[WAITLIST_STATS_FAIL]', { error: String(err) });
    return NextResponse.json({ error: 'Failed to load waitlist stats' }, { status: 500 });
  }
}
