/**
 * GC push worker (T021, FR-602). Consumes FSM transitions and pushes
 * booking state to Google Calendar via the FSM→GC decision table
 * (gcalMapping). Asynchronous (outbox canon 004 — Inngest event + 15-min
 * reconcile sweep): a GC failure NEVER breaks the booking (fail-open, SC-006).
 *
 * Idempotency: events carry extendedProperties.private.undresellerOrderId;
 * replays upsert (find-or-create). Delete is idempotent (F3: 404/410 = NOOP).
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
  GcalCredentialPayload,
} from './gcalClient';
import { mapFsmToGcAction } from './gcalMapping';

/** Find the active credential for a resource (null = instance-wide solo). */
export async function findCredentialForResource(
  resourceId: string | null
): Promise<{ id: string; encryptedPayload: string; calendarId: string } | null> {
  const credential = await prisma.integrationCredential.findFirst({
    where: {
      provider: 'GOOGLE_CALENDAR',
      status: 'CONNECTED',
      OR: [{ resourceId: resourceId ?? 'default_master' }, { resourceId: null }],
    },
    orderBy: [{ resourceId: 'desc' }], // resource-scoped credential wins over instance-wide
  });
  if (!credential) return null;
  return {
    id: credential.id,
    encryptedPayload: credential.encryptedPayload,
    calendarId: parseCredentialPayload(credential.encryptedPayload).calendarId,
  };
}

export interface PushOutcome {
  pushed: boolean;
  action: 'CREATE' | 'PATCH' | 'DELETE' | 'NOOP';
  noop?: boolean;
  reason?: string;
}

/**
 * Push one order's current state to GC. Idempotent — safe to call on every
 * FSM transition, on replays, and from the reconcile sweep.
 */
export async function processGcalPushForOrder(orderId: string): Promise<PushOutcome> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      reservation: { include: { item: true } },
    },
  });
  if (!order) return { pushed: false, action: 'NOOP', reason: 'order_not_found' };

  const resourceId = order.reservation?.resourceId ?? 'default_master';
  const credential = await findCredentialForResource(resourceId);
  if (!credential) return { pushed: false, action: 'NOOP', reason: 'no_credential' };

  let payload: GcalCredentialPayload;
  try {
    payload = parseCredentialPayload(credential.encryptedPayload);
  } catch {
    await markNeedsReauth(credential.id, 'credential_decrypt_failed');
    return { pushed: false, action: 'NOOP', reason: 'credential_decrypt_failed' };
  }

  const item = order.reservation?.item;
  const appointmentStart = order.reservation?.appointmentStartTime ?? order.reservation?.startTime;
  const appointmentEnd = order.reservation?.appointmentEndTime ?? order.reservation?.endTime;
  if (!appointmentStart || !appointmentEnd) {
    return { pushed: false, action: 'NOOP', reason: 'no_appointment_time' };
  }

  // PII-редакция канона 004: masked contacts in the event description
  const description = [
    `Клиент: ${maskName(order.customerName)}`,
    order.customerPhone ? `Телефон: ${maskPhone(order.customerPhone)}` : null,
    order.customerEmail ? `Email: ${maskEmail(order.customerEmail)}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const client = createGcalClient({
    credentialPayload: payload,
    onTokensRefreshed: async (updated) => {
      await prisma.integrationCredential.update({
        where: { id: credential.id },
        data: { encryptedPayload: serializeCredentialPayload(updated) },
      });
    },
  });

  const gcEventId = await client.findGcEventId(orderId).catch((err) => {
    if (err instanceof ReauthRequiredError) throw err;
    return undefined;
  });

  // Determine transition kind from DB state (idempotent, replay-safe).
  // BOOKED/RELEASED live on SlotReservation (OrderStatus has no BOOKED —
  // spec-level CONFIRMED maps to reservation BOOKED, канон 004).
  const toStatus: 'BOOKED' | 'CANCELLED' | 'RESERVATION_RELEASED' | 'PAYMENT_PENDING' =
    order.status === 'CANCELLED'
      ? 'CANCELLED'
      : order.reservation?.status === 'BOOKED'
        ? 'BOOKED'
        : order.reservation?.status === 'RELEASED'
          ? 'RESERVATION_RELEASED'
          : 'PAYMENT_PENDING';

  const action = mapFsmToGcAction({
    orderId,
    toStatus,
    hadGcEvent: Boolean(gcEventId),
    rescheduled: false, // reschedules re-enter via BOOKED + live event → PATCH handled below
    remoteMeetingEnabled: item?.remoteMeetingEnabled === true,
    event:
      order.reservation?.status === 'BOOKED'
        ? {
            serviceTitle: item?.title ?? 'Услуга',
            orderNumber: order.orderNumber,
            startsAtUtc: appointmentStart.toISOString(),
            endsAtUtc: appointmentEnd.toISOString(),
            description,
            resourceId: order.reservation?.resourceId ?? null,
          }
        : undefined,
  });

  try {
    switch (action.kind) {
      case 'CREATE': {
        if (gcEventId) {
          // Replay / post-transfer: PATCH time+description on the live event
          await client.patchEvent({
            calendarId: payload.calendarId,
            gcEventId,
            startsAtUtc: action.payload.startsAtUtc,
            endsAtUtc: action.payload.endsAtUtc,
          });
          await auditPush(order.id, 'patch', 'updated');
          return { pushed: true, action: 'PATCH' };
        }
        const res = await client.pushEvent({
          calendarId: payload.calendarId,
          orderId,
          resourceId: action.payload.resourceId,
          serviceTitle: action.payload.serviceTitle,
          orderNumber: action.payload.orderNumber,
          description: action.payload.description,
          startsAtUtc: action.payload.startsAtUtc,
          endsAtUtc: action.payload.endsAtUtc,
          meet: action.payload.meet,
        });
        // F6-rev: persist Meet link for confirmation emails / admin UI
        if (res.meetLink) {
          await prisma.order.update({ where: { id: orderId }, data: { meetLink: res.meetLink } });
        }
        await auditPush(order.id, 'create', 'created');
        return { pushed: true, action: 'CREATE' };
      }
      case 'PATCH': {
        if (!gcEventId) {
          // Event deleted in GC externally → re-CREATE (F3-rev)
          return await recreateAfterMissing(order, client, payload.calendarId, action);
        }
        await client.patchEvent({
          calendarId: payload.calendarId,
          gcEventId,
          startsAtUtc: action.payload.startsAtUtc,
          endsAtUtc: action.payload.endsAtUtc,
        });
        await auditPush(order.id, 'patch', 'updated');
        return { pushed: true, action: 'PATCH' };
      }
      case 'DELETE': {
        if (!gcEventId) {
          return { pushed: false, action: 'NOOP', noop: true, reason: 'already_deleted' };
        }
        const res = await client.deleteEvent({ calendarId: payload.calendarId, gcEventId });
        await auditPush(order.id, 'delete', res.noop ? 'already_deleted' : 'deleted');
        return { pushed: true, action: 'DELETE', noop: res.noop };
      }
      case 'NOOP':
        return { pushed: false, action: 'NOOP', reason: action.reason };
    }
  } catch (err) {
    if (err instanceof ReauthRequiredError) {
      await markNeedsReauth(credential.id, 'invalid_grant');
      return { pushed: false, action: 'NOOP', reason: 'needs_reauth' };
    }
    if (err instanceof RateLimitedError) {
      logger.warn('[GCAL_PUSH_RATE_LIMITED]', { orderId });
      return { pushed: false, action: 'NOOP', reason: 'rate_limited' };
    }
    throw err;
  }
}

/** Minimal structural view of an Order with its reservation (include). */
interface OrderWithReservation {
  id: string;
  orderNumber: string;
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  reservation: {
    resourceId: string | null;
    startTime: Date;
    endTime: Date;
    appointmentStartTime: Date | null;
    appointmentEndTime: Date | null;
    status: string;
    item: { title: string; remoteMeetingEnabled: boolean } | null;
  } | null;
}

async function recreateAfterMissing(
  order: OrderWithReservation,
  client: ReturnType<typeof createGcalClient>,
  calendarId: string,
  _action: Extract<ReturnType<typeof mapFsmToGcAction>, { kind: 'PATCH' }>
): Promise<PushOutcome> {
  // Rebuild CREATE payload from DB (PATCH action lacks full event payload)
  const item = order.reservation?.item;
  const start = order.reservation?.appointmentStartTime ?? order.reservation?.startTime;
  const end = order.reservation?.appointmentEndTime ?? order.reservation?.endTime;
  if (!start || !end) return { pushed: false, action: 'NOOP', reason: 'no_appointment_time' };
  const res = await client.pushEvent({
    calendarId,
    orderId: order.id,
    resourceId: order.reservation?.resourceId ?? null,
    serviceTitle: item?.title ?? 'Услуга',
    orderNumber: order.orderNumber,
    description: `Клиент: ${maskName(order.customerName)}`,
    startsAtUtc: start.toISOString(),
    endsAtUtc: end.toISOString(),
    meet: item?.remoteMeetingEnabled === true,
  });
  if (res.meetLink) {
    await prisma.order.update({ where: { id: order.id }, data: { meetLink: res.meetLink } });
  }
  await auditPush(order.id, 'create', 'recreated_after_missing');
  return { pushed: true, action: 'CREATE' };
}

async function auditPush(
  orderId: string,
  kind: 'create' | 'patch' | 'delete',
  status: string
): Promise<void> {
  await emitAuditEvent({
    action: 'GCAL_PUSH',
    actorId: 'GCAL_PUSH_WORKER',
    aggregateType: 'BOOKING',
    aggregateId: orderId,
    metadataJson: { kind, status },
  });
}

export async function markNeedsReauth(credentialId: string, cause: string): Promise<void> {
  await prisma.integrationCredential.update({
    where: { id: credentialId },
    data: { status: 'NEEDS_REAUTH', lastError: cause },
  });
  await emitAuditEvent({
    action: 'GCAL_SYNC_FAILED',
    actorId: 'GCAL_PUSH_WORKER',
    aggregateType: 'INTEGRATION_CREDENTIAL',
    aggregateId: credentialId,
    metadataJson: { cause, status: 'NEEDS_REAUTH' },
  });
  await alertStaff('GCAL_NEEDS_REAUTH', credentialId, cause);
}

/** Best-effort staff alert (STAFF_CHAT_ID canon 004) — never throws. */
export async function alertStaff(reason: string, id: string, detail: string): Promise<void> {
  try {
    const chatId = process.env.STAFF_CHAT_ID;
    if (!chatId) return;
    const { sendWithRetry } = await import('@/lib/bot/telegramBot');
    const { bot: staffBot } = await import('@/lib/bot/telegramBot');
    if (!staffBot) return;
    await sendWithRetry(() => staffBot.api.sendMessage(chatId, `⚠️ GCAL ${reason}: ${id} (${detail})`));
  } catch (err) {
    logger.warn('[GCAL_ALERT_FAILED]', { reason, error: String(err) });
  }
}

// PII masking (канон 004 — данные в GC ограничены, но description всё равно маскирован)
function maskName(name: string | null): string {
  if (!name) return '[MASKED]';
  const first = name.trim().split(/\s+/)[0] ?? '';
  return first ? `${first[0]}***` : '[MASKED]';
}
function maskPhone(phone: string): string {
  return phone.length > 4 ? `***${phone.slice(-4)}` : '***';
}
function maskEmail(email: string): string {
  const [user, domain] = email.split('@');
  return `${(user ?? '')[0]}***@${domain ?? '***'}`;
}

/**
 * Fire-and-forget push notification after a BOOKED/CANCELLED transition.
 * Fail-open: never throws, never blocks the booking (SC-006). Uses the
 * Inngest event when configured; the 15-min reconcile sweep covers misses.
 */
export function notifyGcalPush(orderId: string): void {
  void (async () => {
    try {
      const { inngest, isInngestConfigured } = await import('@/lib/jobs/inngest');
      if (isInngestConfigured) {
        await inngest.send({ name: 'gcal/push', data: { orderId } });
      } else {
        await processGcalPushForOrder(orderId);
      }
    } catch (err) {
      logger.warn('[GCAL_NOTIFY_FAILED]', { orderId, error: String(err) });
    }
  })();
}
