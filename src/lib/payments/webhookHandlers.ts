import type { PayloadRequest } from 'payload'

import { applyGatewayEvent } from '@/lib/booking/bookingService'

/**
 * Stripe webhook handlers (spec 003 US2, research D2): registered through the
 * ecommerce plugin adapter's `webhooks` prop — signature verification (400 on
 * tamper) and 200-JSON come from the plugin; this module contributes only the
 * event routing. Any throw inside a handler escapes the plugin endpoint as a
 * 5xx so Stripe retries; the InboxEvent dedupe lives INSIDE the processing
 * transaction, so retries reprocess atomically (never a silent loss, NFR-303).
 */

interface WebhookEventArgs {
  /** Structural view of Stripe.Event — assignable from the SDK type without coupling. */
  event: { type: string; data: { object: unknown } }
  req: PayloadRequest
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

async function handleEvent({ event, req }: WebhookEventArgs): Promise<void> {
  const obj = (event.data?.object ?? {}) as Record<string, unknown>
  switch (event.type) {
    case 'payment_intent.succeeded':
      await applyGatewayEvent(req.payload, {
        provider: 'STRIPE',
        providerRef: String(obj.id),
        eventType: 'payment_intent.succeeded',
        amountMinor: typeof obj.amount === 'number' ? obj.amount : undefined,
        currency: typeof obj.currency === 'string' ? obj.currency : undefined,
      })
      return
    case 'payment_intent.payment_failed':
      await applyGatewayEvent(req.payload, {
        provider: 'STRIPE',
        providerRef: String(obj.id),
        eventType: 'payment_intent.payment_failed',
      })
      return
    case 'charge.refunded':
      await applyGatewayEvent(req.payload, {
        provider: 'STRIPE',
        providerRef: String(obj.payment_intent ?? obj.id),
        eventType: 'charge.refunded',
      })
      return
    case 'checkout.session.completed': {
      // Template parity: route a paid session to the same fulfillment path.
      const paymentIntent = obj.payment_intent
      if (typeof paymentIntent === 'string' && obj.payment_status === 'paid') {
        await applyGatewayEvent(req.payload, {
          provider: 'STRIPE',
          providerRef: paymentIntent,
          eventType: 'payment_intent.succeeded',
          amountMinor: typeof obj.amount_total === 'number' ? obj.amount_total : undefined,
          currency: typeof obj.currency === 'string' ? obj.currency : undefined,
        })
      }
      return
    }
    default:
      // Unknown event types ACK 200 no-op (ACK matrix) — nothing to do.
      return
  }
}

/** Wrapped so unexpected handler errors log with context before escaping as 5xx. */
export const stripeWebhookHandlers = {
  'payment_intent.succeeded': async (args: WebhookEventArgs) => {
    try {
      await handleEvent(args)
    } catch (err) {
      args.req.payload.logger.error({ err, message: `webhook ${args.event.type} failed: ${errorMessage(err)}` })
      throw err
    }
  },
  'payment_intent.payment_failed': async (args: WebhookEventArgs) => {
    try {
      await handleEvent(args)
    } catch (err) {
      args.req.payload.logger.error({ err, message: `webhook ${args.event.type} failed: ${errorMessage(err)}` })
      throw err
    }
  },
  'charge.refunded': async (args: WebhookEventArgs) => {
    try {
      await handleEvent(args)
    } catch (err) {
      args.req.payload.logger.error({ err, message: `webhook ${args.event.type} failed: ${errorMessage(err)}` })
      throw err
    }
  },
  'checkout.session.completed': async (args: WebhookEventArgs) => {
    try {
      await handleEvent(args)
    } catch (err) {
      args.req.payload.logger.error({ err, message: `webhook ${args.event.type} failed: ${errorMessage(err)}` })
      throw err
    }
  },
} as const
