/**
 * Google Calendar adapter (T020, FR-601..603). Thin wrapper over googleapis
 * per contracts/gcal-adapter.md §1. OAuth refresh is encapsulated; updated
 * tokens are persisted through setTokenRefreshHandler → secretVault.
 *
 * Error taxonomy (contract §3):
 *  - ReauthRequiredError (401 / invalid_grant) → credential → NEEDS_REAUTH
 *  - RateLimitedError (429/403) → outbox-shaped exponential backoff
 *  - other 5xx → retry
 */

import { google, calendar_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { decryptSecret, encryptSecret } from './secretVault';
import { logger } from '@/lib/telemetry/logger';

export class ReauthRequiredError extends Error {
  constructor(message = 'Google OAuth re-auth required') {
    super(message);
    this.name = 'ReauthRequiredError';
  }
}

export class RateLimitedError extends Error {
  readonly retryAfterMs: number;
  constructor(retryAfterMs = 60_000, message = 'Google API rate limited') {
    super(message);
    this.name = 'RateLimitedError';
    this.retryAfterMs = retryAfterMs;
  }
}

/** Decrypted credential payload stored in IntegrationCredential.encryptedPayload. */
export interface GcalCredentialPayload {
  refreshToken: string;
  accessToken?: string;
  calendarId: string;
  syncToken?: string;
}

export function parseCredentialPayload(encryptedPayload: string): GcalCredentialPayload {
  return JSON.parse(decryptSecret(encryptedPayload)) as GcalCredentialPayload;
}

export function serializeCredentialPayload(payload: GcalCredentialPayload): string {
  return encryptSecret(JSON.stringify(payload));
}

export interface PushEventInput {
  calendarId: string;
  orderId: string;
  resourceId: string | null;
  serviceTitle: string;
  orderNumber: string;
  description: string;
  startsAtUtc: string;
  endsAtUtc: string;
  meet: boolean;
}

export interface BusyBlock {
  gcEventId: string;
  startUtc: Date;
  endUtc: Date;
}

export interface IncrementalSyncResult {
  blocks: BusyBlock[];
  /** GC event ids that disappeared (deleted / freed). */
  removedEventIds: string[];
  nextSyncToken: string | undefined;
  fullSync: boolean;
}

const OWN_EVENT_MARKER = 'undresellerOrderId';

/** GC event id lookup for an order via extendedProperties (data-model §2:
 * order↔event mapping lives on the Google side, never in our DB). */
export async function findGcEventIdByOrderId(
  client: calendar_v3.Calendar,
  calendarId: string,
  orderId: string
): Promise<string | undefined> {
  const res = await client.events.list({
    calendarId,
    privateExtendedProperty: [`${OWN_EVENT_MARKER}:${orderId}`],
    maxResults: 10,
    showDeleted: false,
  });
  return res.data.items?.[0]?.id ?? undefined;
}

function httpStatus(err: unknown): number | undefined {
  const anyErr = err as { code?: number; response?: { status?: number } };
  return anyErr?.code ?? anyErr?.response?.status;
}

function isReauth(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : '';
  const anyErr = err as { response?: { data?: { error?: string } } };
  return (
    httpStatus(err) === 401 ||
    anyErr?.response?.data?.error === 'invalid_grant' ||
    msg.includes('invalid_grant')
  );
}

export interface GcalClientDeps {
  credentialPayload: GcalCredentialPayload;
  /** Persist rotated tokens (setTokenRefreshHandler contract, F6). */
  onTokensRefreshed?: (updated: GcalCredentialPayload) => Promise<void>;
}

export interface GcalClient {
  pushEvent(input: PushEventInput): Promise<{ gcEventId: string; meetLink?: string }>;
  patchEvent(input: { calendarId: string; gcEventId: string; startsAtUtc: string; endsAtUtc: string }): Promise<void>;
  /** Idempotent delete (F3): 404/410 from Google resolves as success. */
  deleteEvent(input: { calendarId: string; gcEventId: string }): Promise<{ noop: boolean }>;
  incrementalSync(input: { windowDays: number }): Promise<IncrementalSyncResult>;
  findGcEventId(orderId: string): Promise<string | undefined>;
}

export function createGcalClient(deps: GcalClientDeps): GcalClient {
  const { credentialPayload } = deps;

  const oauthClient = new OAuth2Client(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET
  );
  oauthClient.setCredentials({
    refresh_token: credentialPayload.refreshToken,
    access_token: credentialPayload.accessToken ?? undefined,
  });

  // F6: persist rotated access (and possibly refresh) tokens back into the vault.
  oauthClient.on('tokens', (tokens) => {
    const updated: GcalCredentialPayload = {
      ...credentialPayload,
      accessToken: tokens.access_token ?? credentialPayload.accessToken,
      refreshToken: tokens.refresh_token ?? credentialPayload.refreshToken,
    };
    deps
      .onTokensRefreshed?.(updated)
      .catch((err) => logger.error('[GCAL_TOKEN_PERSIST_FAILED]', { error: String(err) }));
  });

  const calendar = google.calendar({ version: 'v3', auth: oauthClient });

  function rethrowClassified(err: unknown): never {
    if (isReauth(err)) throw new ReauthRequiredError();
    const status = httpStatus(err);
    if (status === 429 || status === 403) {
      throw new RateLimitedError();
    }
    throw err as Error;
  }

  return {
    async findGcEventId(orderId: string) {
      try {
        return await findGcEventIdByOrderId(calendar, credentialPayload.calendarId, orderId);
      } catch (err) {
        rethrowClassified(err);
      }
    },

    async pushEvent(input) {
      const event: calendar_v3.Schema$Event = {
        summary: `${input.serviceTitle} — ${input.orderNumber}`,
        description: input.description,
        start: { dateTime: input.startsAtUtc, timeZone: 'UTC' },
        end: { dateTime: input.endsAtUtc, timeZone: 'UTC' },
        extendedProperties: {
          private: { [OWN_EVENT_MARKER]: input.orderId, undresellerResourceId: input.resourceId ?? 'default_master' },
        },
        ...(input.meet ? { conferenceData: { createRequest: { requestId: `undreseller-${input.orderId}` } } } : {}),
      };
      try {
        const res = await calendar.events.insert({
          calendarId: input.calendarId,
          requestBody: event,
          ...(input.meet ? { conferenceDataVersion: 1 } : {}),
        });
        return {
          gcEventId: res.data.id as string,
          meetLink: res.data.hangoutLink ?? undefined,
        };
      } catch (err) {
        rethrowClassified(err);
      }
    },

    async patchEvent({ calendarId, gcEventId, startsAtUtc, endsAtUtc }) {
      try {
        await calendar.events.patch({
          calendarId,
          eventId: gcEventId,
          requestBody: {
            start: { dateTime: startsAtUtc, timeZone: 'UTC' },
            end: { dateTime: endsAtUtc, timeZone: 'UTC' },
          },
        });
      } catch (err) {
        rethrowClassified(err);
      }
    },

    async deleteEvent({ calendarId, gcEventId }) {
      try {
        await calendar.events.delete({ calendarId, eventId: gcEventId });
        return { noop: false };
      } catch (err) {
        const status = httpStatus(err);
        // F3: 404/410 (already deleted / syncToken-gone) → idempotent success
        if (status === 404 || status === 410) return { noop: true };
        rethrowClassified(err);
      }
    },

    async incrementalSync({ windowDays }) {
      const now = new Date();
      const timeMax = new Date(now.getTime() + windowDays * 24 * 60 * 60 * 1000);
      const blocks: BusyBlock[] = [];
      const removedEventIds: string[] = [];
      let nextSyncToken: string | undefined;
      let fullSync = false;

      try {
        if (!credentialPayload.syncToken) {
          // Initial full sync: expanded instances within the window, params
          // fixed (F1-rev) — nextSyncToken is bound to these parameters.
          fullSync = true;
          let pageToken: string | undefined;
          do {
            const res = await calendar.events.list({
              calendarId: credentialPayload.calendarId,
              timeMin: now.toISOString(),
              timeMax: timeMax.toISOString(),
              singleEvents: true,
              showDeleted: true,
              maxResults: 50,
              pageToken,
            });
            for (const ev of res.data.items ?? []) {
              collectDelta(ev, blocks, removedEventIds);
            }
            pageToken = res.data.nextPageToken ?? undefined;
            nextSyncToken = res.data.nextSyncToken ?? nextSyncToken;
          } while (pageToken);
        } else {
          // Incremental sync: plain syncToken, NO filter params (F1-rev —
          // Google API returns 400 for timeMin/q combined with syncToken).
          let pageToken: string | undefined;
          do {
            const res = await calendar.events.list({
              calendarId: credentialPayload.calendarId,
              syncToken: credentialPayload.syncToken,
              maxResults: 50,
              pageToken,
            });
            for (const ev of res.data.items ?? []) {
              collectDelta(ev, blocks, removedEventIds);
            }
            pageToken = res.data.nextPageToken ?? undefined;
            nextSyncToken = res.data.nextSyncToken ?? nextSyncToken;
          } while (pageToken);
        }
      } catch (err) {
        if (httpStatus(err) === 410) {
          // syncToken expired → caller re-runs full sync (410-fallback)
          const stale = new Error('sync token gone (410)') as Error & { gcalGone?: boolean };
          stale.gcalGone = true;
          throw stale;
        }
        rethrowClassified(err);
      }

      return { blocks, removedEventIds, nextSyncToken, fullSync };
    },
  };

  function collectDelta(
    ev: calendar_v3.Schema$Event,
    blocks: BusyBlock[],
    removedEventIds: string[]
  ): void {
    if (!ev.id) return;
    // F2: our own pushed events are strictly ignored — never self-block slots.
    const props = ev.extendedProperties?.private ?? {};
    if (props[OWN_EVENT_MARKER]) return;
    const cancelled = ev.status === 'cancelled';
    const transparent = ev.transparency === 'transparent';
    if (cancelled || transparent) {
      removedEventIds.push(ev.id);
      return;
    }
    const start = ev.start?.dateTime ?? ev.start?.date;
    const end = ev.end?.dateTime ?? ev.end?.date;
    if (!start || !end) return;
    blocks.push({ gcEventId: ev.id, startUtc: new Date(start), endUtc: new Date(end) });
  }
}

/**
 * Session-level advisory lock (F4-rev): sync makes network calls over minutes —
 * a transaction-scoped lock either releases immediately or pins a pool
 * connection for the whole cycle. REPLICA_COUNT=1 makes session-level safe.
 * Returns false when another worker holds the lock for this credential.
 */
export async function tryAcquireSyncLock(credentialId: string): Promise<boolean> {
  const { prisma } = await import('@/lib/db/prisma');
  const rows = await prisma.$queryRaw<{ locked: boolean }[]>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prisma as any)`
      SELECT pg_try_advisory_lock(hashtext('gcal_sync_' || ${credentialId})) AS locked
    `
  );
  return rows[0]?.locked === true;
}

export async function releaseSyncLock(credentialId: string): Promise<void> {
  const { prisma } = await import('@/lib/db/prisma');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (prisma as any)`
    SELECT pg_advisory_unlock(hashtext('gcal_sync_' || ${credentialId}))
  `;
}
