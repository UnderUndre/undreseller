/**
 * Notification Delivery Log (T014, FR-409, data-model 1.6)
 * Records ACCEPTED/FAILED delivery attempts with a salted target hash — raw PII
 * (email addresses, chat ids) never touches the log. No `delivered` state:
 * Telegram bots cannot confirm delivery. 90-day retention via nightlyPurge.
 */

import { createHmac } from 'node:crypto';
import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/telemetry/logger';

export type DeliveryChannel = 'TELEGRAM' | 'EMAIL';
export type DeliveryStatus = 'ACCEPTED' | 'FAILED';

/** Salted hash of a delivery target (chat id / email). Salt from env, never logged. */
export function hashDeliveryTarget(target: string): string {
  const salt = process.env.DELIVERY_LOG_SALT || process.env.ADMIN_TOKEN || 'undreseller-dl-salt';
  return createHmac('sha256', salt).update(target).digest('hex');
}

export interface DeliveryAttemptInput {
  channel: DeliveryChannel;
  /** Raw target (chat id or email) — hashed before persistence, never stored raw. */
  target: string;
  status: DeliveryStatus;
  bookingRefId?: string | null;
  orderId?: string | null;
  providerRef?: string | null;
  errorCode?: string | null;
  latencyMs?: number | null;
  startedAt?: Date;
}

export async function logDeliveryAttempt(input: DeliveryAttemptInput): Promise<void> {
  const attemptAt = input.startedAt ?? new Date();
  const latencyMs =
    input.latencyMs ?? (input.startedAt ? Date.now() - input.startedAt.getTime() : null);

  try {
    await prisma.notificationDeliveryLog.create({
      data: {
        bookingRefId: input.bookingRefId ?? null,
        orderId: input.orderId ?? null,
        channel: input.channel,
        targetHash: hashDeliveryTarget(input.target),
        status: input.status,
        providerRef: input.providerRef ?? null,
        errorCode: input.errorCode ?? null,
        attemptAt,
        latencyMs,
      },
    });

    // Structured log through the deny-list logger — hashes only, zero raw PII.
    logger.info('[DELIVERY_LOG]', {
      channel: input.channel,
      status: input.status,
      targetHash: hashDeliveryTarget(input.target).slice(0, 12) + '…',
      orderId: input.orderId ?? null,
      errorCode: input.errorCode ?? null,
      latencyMs,
    });
  } catch (err: unknown) {
    // Delivery logging must never break the notification path itself.
    logger.error('[DELIVERY_LOG_WRITE_FAILED]', { error: String(err) });
  }
}

/** 90-day retention sweep — invoked from nightlyPurge. */
export async function purgeDeliveryLogsOlderThan90Days(): Promise<number> {
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const result = await prisma.notificationDeliveryLog.deleteMany({
    where: { attemptAt: { lte: cutoff } },
  });
  return result.count;
}

/**
 * Zero-PII audit helper (SC-403): verifies no raw PII is present in a serialized
 * log payload — used by the automated log-scan test.
 */
export function assertNoPiiInLogPayload(payload: Record<string, unknown>): void {
  const serialized = JSON.stringify(payload).toLowerCase();
  const forbidden = /@(gmail|outlook|yahoo|proton)|\+\d{9,}|tg_id=\d{5,}/;
  if (forbidden.test(serialized)) {
    throw new Error('PII leak detected in log payload');
  }
}
