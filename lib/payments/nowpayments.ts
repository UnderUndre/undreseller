import { createHmac, timingSafeEqual } from 'node:crypto';
import { fulfillPayment } from './fulfillment';
import { logger } from '@/lib/telemetry/logger';
import { bot, sendWithRetry } from '@/lib/bot/telegramBot';

export interface NowPaymentsIPNPayload {
  payment_id: number | string;
  payment_status: string;
  pay_address?: string;
  price_amount: number;
  price_currency: string;
  pay_amount: number;
  actually_paid: number;
  pay_currency: string;
  order_id?: string;
  order_description?: string;
  purchase_id?: string;
  [key: string]: unknown;
}

export function verifyNowPaymentsSignature(
  rawBody: string | Record<string, unknown>,
  signatureHeader: string | null
): boolean {
  const ipnSecret = process.env.NOWPAYMENTS_IPN_SECRET;
  if (!ipnSecret || !signatureHeader) {
    return false;
  }

  try {
    const payload = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
    const sortedKeys = Object.keys(payload).sort();
    const sortedObj: Record<string, unknown> = {};
    for (const key of sortedKeys) {
      sortedObj[key] = payload[key];
    }

    const serialized = JSON.stringify(sortedObj);
    const expectedSignature = createHmac('sha512', ipnSecret).update(serialized).digest('hex');

    if (signatureHeader.length !== expectedSignature.length) {
      return false;
    }

    return timingSafeEqual(
      Buffer.from(signatureHeader, 'utf-8'),
      Buffer.from(expectedSignature, 'utf-8')
    );
  } catch {
    return false;
  }
}

export async function processNowPaymentsNotification(
  payload: NowPaymentsIPNPayload
): Promise<{ status: string }> {
  const orderId = payload.order_id;
  if (!orderId) {
    throw new Error('Missing order_id in NOWPayments IPN payload');
  }

  // Check payment status
  const status = (payload.payment_status || '').toLowerCase();
  if (status !== 'finished' && status !== 'confirmed') {
    logger.info(`NOWPayments status ${status} for order ${orderId} ignored`);
    return { status: 'IGNORED_STATUS' };
  }

  // 99% Rule: paid / quoted < 0.99
  const quoted = Number(payload.pay_amount);
  const paid = Number(payload.actually_paid);

  if (quoted > 0 && paid / quoted < 0.99) {
    logger.warn(`[UNDERPAID_CRYPTO] orderId=${orderId} paid=${paid}/${quoted}`);

    // Alert admin of underpayment, keep order in PENDING
    const adminChatId = process.env.ADMIN_CHAT_ID;
    if (adminChatId) {
      await sendWithRetry(() =>
        bot.api.sendMessage(
          adminChatId,
          `⚠️ [UNDERPAYMENT_ALERT] Order #${orderId.slice(0, 8)} underpaid!\nExpected: ${quoted} ${payload.pay_currency}\nActual: ${paid} ${payload.pay_currency}\nRatio: ${((paid / quoted) * 100).toFixed(1)}%`
        )
      );
    }

    return { status: 'UNDERPAID' };
  }

  // Fulfillment: 100% or within 99% threshold
  const amountMinor = Math.round(Number(payload.price_amount) * 100);
  const providerRef = String(payload.payment_id);

  const result = await fulfillPayment({
    orderId,
    provider: 'CRYPTO_GATEWAY',
    providerRef,
    amountMinor,
    currency: payload.price_currency?.toUpperCase() || 'USD',
  });

  return { status: result.status };
}
