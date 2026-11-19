import Stripe from 'stripe'

import { BookingError } from '@/lib/booking/bookingService'

/**
 * Payment gateway seam (spec 003 research D4): the booking/refund services call
 * this interface instead of the Stripe SDK directly, so the money path is
 * integration-testable without network. Production binding is `stripeGateway`
 * (lazy client — a missing key fails at first use, never at boot/build).
 */
export interface PaymentGateway {
  createPaymentIntent(params: {
    amountMinor: number
    currency: string
    bookingId: number
  }): Promise<{ id: string; clientSecret: string | null }>
  createRefund(params: { paymentIntentId: string; idempotencyKey?: string }): Promise<{ id: string }>
}

let client: Stripe | null = null

function getStripe(): Stripe {
  if (client) return client
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) {
    throw new BookingError(
      'PAYMENT_INIT_FAILED',
      502,
      'STRIPE_SECRET_KEY is not configured (fail-closed): prepayment unavailable',
    )
  }
  client = new Stripe(key)
  return client
}

/**
 * E2E fake seam (spec 015 FR-1502, fix AG-F1): when E2E_GATEWAY=fake the whole
 * money path runs WITHOUT any Stripe SDK/network call — deterministic intents
 * with a Stripe-FORMAT clientSecret (`pi_e2e_<id>_secret_e2e`) so the
 * confirmation page renders <DepositPayment> end-to-end. The prod path without
 * the env var is byte-identical to the pre-015 gateway.
 */
const fakeGateway: PaymentGateway = {
  async createPaymentIntent({ bookingId }) {
    return { id: `pi_e2e_${bookingId}`, clientSecret: `pi_e2e_${bookingId}_secret_e2e` }
  },
  async createRefund({ paymentIntentId }) {
    return { id: `re_e2e_${paymentIntentId}` }
  },
}

const isFakeGateway = process.env.E2E_GATEWAY === 'fake'

export const stripeGateway: PaymentGateway = isFakeGateway
  ? fakeGateway
  : {
      async createPaymentIntent({ amountMinor, currency, bookingId }) {
        const intent = await getStripe().paymentIntents.create({
          amount: amountMinor,
          currency: currency.toLowerCase(),
          metadata: { bookingId: String(bookingId) },
          automatic_payment_methods: { enabled: true },
        })
        return { id: intent.id, clientSecret: intent.client_secret }
      },

      async createRefund({ paymentIntentId, idempotencyKey }) {
        const refund = await getStripe().refunds.create(
          { payment_intent: paymentIntentId },
          idempotencyKey ? { idempotencyKey } : undefined,
        )
        return { id: refund.id }
      },
    }

/**
 * Retrieve client_secret for an existing PaymentIntent on server-rendered pages (spec 012).
 */
export async function retrieveClientSecret(paymentIntentId: string): Promise<string | null> {
  // E2E fake seam: pi_e2e_ refs resolve deterministically, no SDK call (AG-F1).
  if (isFakeGateway && paymentIntentId.startsWith('pi_e2e_')) {
    return `${paymentIntentId}_secret_e2e`
  }
  try {
    const intent = await getStripe().paymentIntents.retrieve(paymentIntentId)
    return intent.client_secret
  } catch {
    return null
  }
}
