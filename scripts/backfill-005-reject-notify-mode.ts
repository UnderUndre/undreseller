import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/telemetry/logger';

/**
 * Idempotent backfill script (T011 / FR-540): migrates legacy env-based
 * STAFF_REJECT_NOTIFY_MODE to the new ShopSettings.staffRejectNotifyMode column.
 */
export async function backfillStaffRejectNotifyMode(): Promise<{ updated: boolean; mode: string }> {
  try {
    const settings = await prisma.shopSettings.findUnique({ where: { id: 1 } });
    if (!settings) {
      logger.warn('[BACKFILL_005] ShopSettings record not found for id=1');
      return { updated: false, mode: 'NOTIFY_CUSTOMER' };
    }

    const envMode = (process.env.STAFF_REJECT_NOTIFY_MODE || '').trim().toUpperCase();
    let targetMode: 'NOTIFY_CUSTOMER' | 'SILENT' | 'STAFF_ONLY' = 'NOTIFY_CUSTOMER';
    if (envMode === 'SILENT') targetMode = 'SILENT';
    else if (envMode === 'STAFF_ONLY') targetMode = 'STAFF_ONLY';

    await prisma.shopSettings.update({
      where: { id: 1 },
      data: { staffRejectNotifyMode: targetMode },
    });

    logger.info('[BACKFILL_005] Successfully populated staffRejectNotifyMode', { targetMode });
    return { updated: true, mode: targetMode };
  } catch (err: unknown) {
    logger.error('[BACKFILL_005] Failed to backfill staffRejectNotifyMode', { error: String(err) });
    throw err;
  }
}

if (require.main === module) {
  backfillStaffRejectNotifyMode()
    .then((res) => {
      console.log(`✓ Backfill 005 completed successfully: mode=${res.mode}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ Backfill 005 failed:', err);
      process.exit(1);
    })
}
