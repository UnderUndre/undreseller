import { createHmac, timingSafeEqual } from 'node:crypto';
import { fulfillPayment } from './fulfillment';
import {
  assertValidInvoiceAmount,
  registerPaymentProviderFactory,
  type PaymentProvider,
  type ParsedCallback,
  type CallbackStatus,
} from './providerContract';
import { getCurrencyMetadata } from '../../config/currency-registry';
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

// ---------------------------------------------------------------------------
// NOWPayments adapter (T022, contracts/payment-provider.md)
// Server-side invoice creation via POST https://api.nowpayments.io/v1/invoice.
// paymentUrl is ALWAYS provider-issued — hand-built URLs are prohibited (003 audit).
// ---------------------------------------------------------------------------

const NOWPAYMENTS_API_BASE = process.env.NOWPAYMENTS_API_BASE || 'https://api.nowpayments.io/v1';

/** Maps NOWPayments IPN statuses onto the provider-neutral CallbackStatus union. */
export function mapNowPaymentsStatus(rawStatus: string): CallbackStatus {
  const status = (rawStatus || '').toLowerCase();
  switch (status) {
    case 'waiting':
      return 'waiting';
    case 'confirming':
    case 'confirmed':
    case 'sending':
      return 'confirming';
    case 'finished':
      return 'finished';
    case 'partially_paid':
      return 'partially_paid';
    case 'failed':
    case 'refunded':
      return 'failed';
    case 'expired':
      return 'expired';
    default:
      throw new Error(`Unknown NOWPayments payment_status: '${rawStatus}'`);
  }
}

/**
 * Converts a provider wire amount (major units of `currency`) into registry
 * minor units using CurrencyMetadata scale — never hard-coded ×100 (T026).
 */
export function nowPaymentsWireAmountToMinor(amount: number, currency: string): number {
  const meta = getCurrencyMetadata(currency);
  const minorUnit = meta ? meta.minorUnit : 2;
  return Math.round(amount * Math.pow(10, minorUnit));
}

export function createNowPaymentsProvider(
  config: { apiKey?: string } = {}
): PaymentProvider {
  const apiKey = config.apiKey ?? process.env.NOWPAYMENTS_API_KEY;
  if (!apiKey) {
    throw new Error('NOWPAYMENTS adapter requires NOWPAYMENTS_API_KEY');
  }

  return {
    id: 'NOWPAYMENTS',
    capabilities: { fiat: false, crypto: true, refunds: 'manual' },

    async createInvoice(input) {
      assertValidInvoiceAmount(input.amountMinor);
      const meta = getCurrencyMetadata(input.currency);
      if (!meta) {
        throw new Error(`Unknown currency in registry: ${input.currency}`);
      }
      // Translate registry minor units back to provider wire scale (major units).
      const priceAmount = input.amountMinor / Math.pow(10, meta.minorUnit);

      const response = await fetch(`${NOWPAYMENTS_API_BASE}/invoice`, {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          order_id: input.orderId,
          price_amount: priceAmount,
          price_currency: meta.code,
          // Amounts are fixed server-side; success/cancel land back on the shop.
          success_url: `${input.callbackBaseUrl}/checkout?paid=1&orderId=${input.orderId}`,
          cancel_url: `${input.callbackBaseUrl}/checkout?cancelled=1&orderId=${input.orderId}`,
        }),
      });

      if (!response.ok) {
        const bodyText = await response.text().catch(() => '');
        throw new Error(
          `NOWPayments invoice creation failed: HTTP ${response.status}${bodyText ? ` — ${bodyText.slice(0, 200)}` : ''}`
        );
      }

      const data = (await response.json()) as { id?: string | number; invoice_url?: string };
      if (!data.id || !data.invoice_url) {
        throw new Error('NOWPayments invoice response missing id/invoice_url');
      }

      return {
        providerPaymentId: String(data.id),
        // Provider-issued URL — never assembled locally.
        paymentUrl: data.invoice_url,
      };
    },

    verifyCallback(rawBody: string, signature: string | null): boolean {
      return verifyNowPaymentsSignature(rawBody, signature);
    },

    parseCallback(rawBody: string): ParsedCallback {
      const payload = JSON.parse(rawBody) as NowPaymentsIPNPayload;
      if (!payload.order_id) {
        throw new Error('Missing order_id in NOWPayments callback');
      }
      const currency = (payload.price_currency || 'USD').toUpperCase();
      const minorUnit = getCurrencyMetadata(currency)?.minorUnit ?? 2;
      const scale = Math.pow(10, minorUnit);
      const quotedMinor = Math.round(Number(payload.price_amount) * scale);
      // actually_paid is denominated in the (crypto) pay currency; convert to the
      // quoted fiat registry scale via the pay ratio, then to minor units.
      const payAmount = Number(payload.pay_amount);
      const ratio = payAmount > 0 ? Number(payload.actually_paid) / payAmount : 0;
      const paidMinor = Math.round(quotedMinor * ratio);

      return {
        providerPaymentId: String(payload.payment_id),
        orderId: payload.order_id,
        status: mapNowPaymentsStatus(String(payload.payment_status)),
        paidMinor,
        quotedMinor,
      };
    },
  };
}

// Registry self-registration (FR-401): PAYMENT_PROVIDERS=NOWPAYMENTS activates the adapter.
registerPaymentProviderFactory('NOWPAYMENTS', () => createNowPaymentsProvider());


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

  // T023: first `confirming` freezes the hold TTL (holdFrozenAt; 24h hard ceiling).
  if (status === 'confirming') {
    const { recordConfirmingFreeze } = await import('./fulfillment');
    const freeze = await recordConfirmingFreeze(orderId);
    return { status: freeze.frozen ? 'CONFIRMING_HOLD_FROZEN' : 'CONFIRMING_NO_HOLD' };
  }

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
