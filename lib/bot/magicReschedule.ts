/**
 * Server-only: генерация и проверка одноразовых magic-ссылок на перенос.
 * Использует node:crypto, поэтому импортируется только из серверного кода
 * (staffActions, route handlers). НЕ импортировать из клиентских компонентов!
 */

import { randomUUID, createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { MAGIC_RESCHEDULE_TTL_MS } from './staffBot';

function getRescheduleSecret(): string {
  return (
    process.env.STAFF_WEBHOOK_SECRET ||
    process.env.ADMIN_TOKEN ||
    'default-sovereign-reschedule-secret'
  );
}

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export interface MagicRescheduleTokenBundle {
  token: string;
  url: string;
  nonce: string;
  rescheduleTokenHash: string;
  expiresAtMs: number;
  scheduleVersion: number;
}

export function generateMagicRescheduleLink(params: {
  orderId: string;
  scheduleVersion: number;
  now?: Date;
  baseUrl?: string;
}): MagicRescheduleTokenBundle {
  const now = params.now || new Date();
  const expiresAtMs = now.getTime() + MAGIC_RESCHEDULE_TTL_MS;
  const nonce = randomUUID();
  const rescheduleTokenHash = sha256Hex(nonce);

  const payloadStr = `${params.orderId}:${params.scheduleVersion}:${expiresAtMs}:${nonce}`;
  const signature = createHmac('sha256', getRescheduleSecret())
    .update(payloadStr)
    .digest('hex');

  const token = Buffer.from(`${payloadStr}:${signature}`, 'utf-8').toString('base64url');
  const appBase = params.baseUrl || process.env.NEXT_PUBLIC_APP_URL || 'https://undreseller.com';
  const url = `${appBase}/book?rescheduleToken=${encodeURIComponent(token)}`;

  return {
    token,
    url,
    nonce,
    rescheduleTokenHash,
    expiresAtMs,
    scheduleVersion: params.scheduleVersion,
  };
}

export interface VerifyRescheduleTokenResult {
  valid: boolean;
  reason?: string;
  orderId?: string;
  scheduleVersion?: number;
  expiresAtMs?: number;
  nonce?: string;
}

export function verifyMagicRescheduleToken(
  token: string,
  orderState: {
    id: string;
    scheduleVersion: number;
    rescheduleTokenHash: string | null;
    rescheduleTokenConsumedAt: Date | null;
  },
  now = new Date()
): VerifyRescheduleTokenResult {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf-8');
    const parts = decoded.split(':');
    if (parts.length !== 5) {
      return { valid: false, reason: 'MALFORMED_TOKEN' };
    }

    const [orderId, versionStr, expiresAtStr, nonce, providedSig] = parts;
    const scheduleVersion = parseInt(versionStr, 10);
    const expiresAtMs = parseInt(expiresAtStr, 10);

    if (!orderId || isNaN(scheduleVersion) || isNaN(expiresAtMs) || !nonce || !providedSig) {
      return { valid: false, reason: 'INVALID_TOKEN_FIELDS' };
    }

    const payloadStr = `${orderId}:${scheduleVersion}:${expiresAtMs}:${nonce}`;
    const expectedSig = createHmac('sha256', getRescheduleSecret())
      .update(payloadStr)
      .digest('hex');

    if (
      providedSig.length !== expectedSig.length ||
      !timingSafeEqual(Buffer.from(providedSig, 'utf-8'), Buffer.from(expectedSig, 'utf-8'))
    ) {
      return { valid: false, reason: 'INVALID_HMAC_SIGNATURE' };
    }

    if (orderId !== orderState.id) {
      return { valid: false, reason: 'ORDER_ID_MISMATCH' };
    }

    if (now.getTime() >= expiresAtMs) {
      return { valid: false, reason: 'TOKEN_EXPIRED' };
    }

    if (orderState.rescheduleTokenConsumedAt !== null) {
      return { valid: false, reason: 'TOKEN_ALREADY_CONSUMED' };
    }

    if (orderState.scheduleVersion !== scheduleVersion) {
      return { valid: false, reason: 'STALE_SCHEDULE_VERSION' };
    }

    const computedNonceHash = sha256Hex(nonce);
    if (!orderState.rescheduleTokenHash || computedNonceHash !== orderState.rescheduleTokenHash) {
      return { valid: false, reason: 'NONCE_HASH_MISMATCH' };
    }

    return {
      valid: true,
      orderId,
      scheduleVersion,
      expiresAtMs,
      nonce,
    };
  } catch {
    return { valid: false, reason: 'DECODE_FAILURE' };
  }
}
