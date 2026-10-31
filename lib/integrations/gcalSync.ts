/**
 * GC sync worker (T022, FR-603): imports third-party busy intervals into
 * ExternalBusyBlock, per credential. 15-min cycle (Inngest cron / startup
 * poller), session-level advisory lock per credential (F4-rev), syncToken
 * incremental sync with valid parameter combinations (F1-rev), own-event
 * filtering (F2), 410 → full-sync fallback, batches ≤50 (NFR-601).
 */

import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/telemetry/logger';
import { emitAuditEvent } from '@/lib/security/staffAuth';
import {
  createGcalClient,
  parseCredentialPayload,
  serializeCredentialPayload,
  ReauthRequiredError,
  RateLimitedError,
  tryAcquireSyncLock,
  releaseSyncLock,
} from './gcalClient';
import { markNeedsReauth } from './gcalPush';

export const BUSY_WINDOW_DAYS = 30;
export const SYNC_INTERVAL_MS = 15 * 60 * 1000;
const MAX_BACKOFF_MS = 5 * 60 * 1000;

export interface SyncCycleResult {
  credentialId: string;
  skipped?: 'lock_held' | 'rate_limited' | 'needs_reauth';
  upserted?: number;
  deleted?: number;
  fullSync?: boolean;
}

/** One sync cycle for one credential. Lock is per-credential (F5). */
export async function runSyncCycleForCredential(credentialId: string): Promise<SyncCycleResult> {
  const locked = await tryAcquireSyncLock(credentialId);
  if (!locked) return { credentialId, skipped: 'lock_held' };

  try {
    const credential = await prisma.integrationCredential.findUnique({ where: { id: credentialId } });
    if (!credential || credential.status !== 'CONNECTED') {
      return { credentialId, skipped: 'needs_reauth' };
    }
    const payload = parseCredentialPayload(credential.encryptedPayload);

    const client = createGcalClient({
      credentialPayload: payload,
      onTokensRefreshed: async (updated) => {
          await prisma.integrationCredential.update({
            where: { id: credentialId },
            data: { encryptedPayload: serializeCredentialPayload(updated) },
          });
        },
    });

    let result;
    try {
      result = await client.incrementalSync({ windowDays: BUSY_WINDOW_DAYS });
    } catch (err) {
      const gone = err as Error & { gcalGone?: boolean };
      if (gone.gcalGone) {
        // 410 Gone → full sync fallback: drop the stale token, re-run once
        const freshPayload = { ...payload, syncToken: undefined };
        const freshClient = createGcalClient({ credentialPayload: freshPayload });
        result = await freshClient.incrementalSync({ windowDays: BUSY_WINDOW_DAYS });
        if (result.nextSyncToken) {
          await prisma.integrationCredential.update({
            where: { id: credentialId },
            data: {
              encryptedPayload: serializeCredentialPayload({
                ...freshPayload,
                syncToken: result.nextSyncToken,
              }),
            },
          });
        }
      } else if (err instanceof ReauthRequiredError) {
        await markNeedsReauth(credentialId, 'invalid_grant');
        return { credentialId, skipped: 'needs_reauth' };
      } else if (err instanceof RateLimitedError) {
        return { credentialId, skipped: 'rate_limited' };
      } else {
        throw err;
      }
    }

    // Persist the (updated) sync token for the non-410 path as well
    if (result.nextSyncToken && payload.syncToken !== result.nextSyncToken) {
      await prisma.integrationCredential.update({
        where: { id: credentialId },
        data: {
          encryptedPayload: serializeCredentialPayload({ ...payload, syncToken: result.nextSyncToken }),
        },
      });
    }

    // Upsert busy blocks (UTC-normalized; dedup by (calendarId, gcEventId))
    let upserted = 0;
    const expiresAt = new Date(Date.now() + BUSY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    for (const block of result.blocks) {
      await prisma.externalBusyBlock.upsert({
        where: {
          calendarId_gcEventId: { calendarId: payload.calendarId, gcEventId: block.gcEventId },
        },
        create: {
          resourceId: credential.resourceId,
          calendarId: payload.calendarId,
          gcEventId: block.gcEventId,
          startUtc: block.startUtc,
          endUtc: block.endUtc,
          source: 'GCAL',
          expiresAt,
        },
        update: {
          startUtc: block.startUtc,
          endUtc: block.endUtc,
          expiresAt,
        },
      });
      upserted += 1;
    }

    // Delete blocks for events that vanished / freed
    let deleted = 0;
    for (const gcEventId of result.removedEventIds) {
      const res = await prisma.externalBusyBlock.deleteMany({
        where: { calendarId: payload.calendarId, gcEventId },
      });
      deleted += res.count;
    }

    // GC own events whose end passed long ago + expired blocks cleanup
    await prisma.externalBusyBlock.deleteMany({
      where: { OR: [{ expiresAt: { lt: new Date() } }, { endUtc: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } }] },
    });

    await prisma.integrationCredential.update({
      where: { id: credentialId },
      data: { lastSyncAt: new Date(), lastError: null },
    });

    return { credentialId, upserted, deleted, fullSync: result.fullSync };
  } catch (err) {
    await prisma.integrationCredential
      .update({ where: { id: credentialId }, data: { lastError: String(err).slice(0, 500) } })
      .catch(() => undefined);
    await emitAuditEvent({
      action: 'GCAL_SYNC_FAILED',
      actorId: 'GCAL_SYNC_WORKER',
      aggregateType: 'INTEGRATION_CREDENTIAL',
      aggregateId: credentialId,
      metadataJson: { error: String(err).slice(0, 300) },
    });
    throw err;
  } finally {
    await releaseSyncLock(credentialId).catch(() => undefined);
  }
}

/** Sweep all CONNECTED credentials (cron entry, every 15 min). */
export async function runSyncSweep(): Promise<SyncCycleResult[]> {
  const credentials = await prisma.integrationCredential.findMany({
    where: { provider: 'GOOGLE_CALENDAR', status: 'CONNECTED' },
    select: { id: true },
  });
  const results: SyncCycleResult[] = [];
  // Batches ≤50; sequential per-credential (per-credential lock isolates
  // masters; sequential keeps us far below Google's 600 req/min/user quota).
  for (let i = 0; i < credentials.length; i += 50) {
    for (const { id } of credentials.slice(i, i + 50)) {
      try {
        results.push(await runSyncCycleForCredential(id));
      } catch (err) {
        logger.error('[GCAL_SYNC_CYCLE_FAILED]', { credentialId: id, error: String(err) });
      }
    }
  }
  return results;
}

export function computeBackoffDelayMs(attempt: number): number {
  return Math.min(30_000 * 2 ** attempt, MAX_BACKOFF_MS);
}
