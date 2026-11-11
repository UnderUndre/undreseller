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

export const stripeGateway: PaymentGateway = {
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
