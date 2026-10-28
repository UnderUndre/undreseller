import Stripe from 'stripe';
import {
  assertValidInvoiceAmount,
  registerPaymentProviderFactory,
  type PaymentProvider,
  type ParsedCallback,
  type CallbackStatus,
  type PaymentProviderInvoiceInput,
  type PaymentProviderInvoice,
} from './providerContract';
import { getCurrencyMetadata } from '../../config/currency-registry';
import { logger } from '@/lib/telemetry/logger';

/**
 * T030 / FR-510..513: Stripe Hosted Checkout Payment Provider Adapter.
 * Uses official `stripe` SDK (MIT), exact-pin 17.5.0.
 * TTL = 15 mins (PREPAID_HOLD_TTL_MS). Dashboard-driven payment methods.
 * Canonical providerPaymentId = Stripe payment_intent (pi_...) for accurate refund mapping.
 */

let stripeClientInstance: Stripe | null = null;

function getStripeClient(): Stripe {
  if (stripeClientInstance) return stripeClientInstance;
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error('STRIPE adapter requires STRIPE_SECRET_KEY environment variable');
  }
  stripeClientInstance = new Stripe(secretKey, {
    apiVersion: '2025-02-28.acacia' as Stripe.LatestApiVersion,
    typescript: true,
  });
  return stripeClientInstance;
}

export function createStripeProvider(): PaymentProvider {
  return {
    id: 'STRIPE',
    capabilities: { fiat: true, crypto: false, refunds: 'manual' },

    async createInvoice(input: PaymentProviderInvoiceInput): Promise<PaymentProviderInvoice> {
      assertValidInvoiceAmount(input.amountMinor);
      const meta = getCurrencyMetadata(input.currency);
      if (!meta) {
        throw new Error(`Unknown currency in registry: ${input.currency}`);
      }

      const stripe = getStripeClient();
      const expiresAtUnix = Math.floor(Date.now() / 1000) + 15 * 60; // 15 mins matching FSM hold TTL

      const session = await stripe.checkout.sessions.create(
        {
          mode: 'payment',
          expires_at: expiresAtUnix,
          line_items: [
            {
              price_data: {
                currency: input.currency.toLowerCase(),
                unit_amount: input.amountMinor, // registry minor units as-is (no ×100 assumptions)
                product_data: {
                  name: `Service Booking Order #${input.orderId.substring(0, 8)}`,
                },
              },
              quantity: 1,
            },
          ],
          metadata: {
            orderId: input.orderId,
          },
          success_url: `${input.callbackBaseUrl}/checkout?orderId=${input.orderId}&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${input.callbackBaseUrl}/checkout?orderId=${input.orderId}&cancelled=true`,
        },
        {
          idempotencyKey: `inv_${input.orderId}`,
        }
      );

      if (!session.url) {
        throw new Error('Stripe failed to generate a Checkout Session URL');
      }

      return {
        providerPaymentId: session.id,
        paymentUrl: session.url,
      };
    },

    verifyCallback(rawBody: string, signature: string | null): boolean {
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
      if (!webhookSecret || !signature) {
        return false;
      }
      try {
        const stripe = getStripeClient();
        // Timing-safe verification handled inside SDK constructEvent
        stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
        return true;
      } catch (err: unknown) {
        logger.error('[STRIPE_SIGNATURE_VERIFY_FAILED]', { error: String(err) });
        return false;
      }
    },

    parseCallback(rawBody: string): ParsedCallback {
      const event = JSON.parse(rawBody) as Stripe.Event;
      const dataObj = event.data.object as unknown as Record<string, unknown>;

      let orderId = (dataObj.metadata as Record<string, string>)?.orderId;
      let providerPaymentId = String(dataObj.id || '');
      let paidMinor = 0;
      const quotedMinor = Number(dataObj.amount_total || dataObj.amount || 0);

      if (event.type === 'checkout.session.completed') {
        const session = event.data.object as Stripe.Checkout.Session;
        orderId = session.metadata?.orderId || '';
        // F4: Canonical providerPaymentId is payment_intent (pi_...) so charge.refunded links correctly
        providerPaymentId = typeof session.payment_intent === 'string' ? session.payment_intent : session.id;
        paidMinor = session.amount_total || 0;
      } else if (event.type === 'charge.refunded') {
        const charge = event.data.object as unknown as Stripe.Charge;
        providerPaymentId = charge.payment_intent ? String(charge.payment_intent) : charge.id;
        paidMinor = charge.amount_refunded || 0;
      }

      if (!orderId) {
        throw new Error(`Stripe webhook event ${event.type} missing orderId in metadata`);
      }

      let status: CallbackStatus = 'waiting';
      if (event.type === 'checkout.session.completed') {
        status = 'finished';
      } else if (event.type === 'checkout.session.expired') {
        status = 'expired';
      } else if (event.type === 'payment_intent.payment_failed') {
        status = 'failed';
      } else if (event.type === 'charge.refunded') {
        status = 'finished'; // Handled via refund operation
      }

      return {
        providerPaymentId,
        orderId,
        status,
        paidMinor,
        quotedMinor,
      };
    },
  };
}

// Auto-register stripe provider factory
registerPaymentProviderFactory('STRIPE', () => createStripeProvider());
