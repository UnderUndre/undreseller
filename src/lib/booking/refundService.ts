import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import { stripeGateway, type PaymentGateway } from '@/lib/payments/stripeGateway'

/**
 * Staff refund resolution (spec 003 FR-304, research D5): post-cutoff cancellations
 * land in `refund_requested` (24h SLA); OWNER/OPERATOR resolve through this service.
 * Reject is recorded and terminal; approve calls the gateway and settles to
 * `refunded` (the `charge.refunded` webhook then reconciles the ledger).
 */

export type RefundAction = 'approve' | 'reject'

export interface RefundResolutionResult {
  status: 'refunded' | 'refund_rejected' | 'refund_failed' | 'ALREADY_RESOLVED'
}

export async function resolveRefundRequest(
  payload: Payload,
  input: { orderId: string; action: RefundAction; actorId: string; gateway?: PaymentGateway },
): Promise<RefundResolutionResult> {
  const db: any = payload.db
  const orderRes = await db.execute({
    drizzle: db.drizzle,
    sql: sql`SELECT id, status, amount, stripe_payment_intent_ref AS stripe_payment_intent_id
             FROM orders WHERE id = ${input.orderId} LIMIT 1`,
  })
  const order = orderRes.rows?.[0] as
    | { id: number; status: string; amount: number; stripe_payment_intent_id: string | null }
    | undefined
  if (!order) {
    throw new Error('ORDER_NOT_FOUND')
  }
  if (order.status !== 'refund_requested') {
    return { status: 'ALREADY_RESOLVED' }
  }

  if (input.action === 'reject') {
    await db.execute({
      drizzle: db.drizzle,
      sql: sql`UPDATE orders SET status = 'refund_rejected', updated_at = now() WHERE id = ${order.id}`,
    })
    await db.execute({
      drizzle: db.drizzle,
      sql: sql`INSERT INTO audit_events (action, actor_id, aggregate_type, aggregate_id, metadata_json, created_at, updated_at)
               VALUES ('payment.refund.rejected', ${input.actorId}, 'ORDER', ${String(order.id)}, '{}'::jsonb, now(), now())`,
    })
    return { status: 'refund_rejected' }
  }

  const gw = input.gateway ?? stripeGateway
  try {
    await gw.createRefund({ paymentIntentId: order.stripe_payment_intent_id as string })
  } catch {
    // Money is NOT lost — the verifiable tail state remains staff-visible.
    await db.execute({
      drizzle: db.drizzle,
      sql: sql`UPDATE orders SET status = 'refund_failed', updated_at = now() WHERE id = ${order.id}`,
    })
    await db.execute({
      drizzle: db.drizzle,
      sql: sql`INSERT INTO audit_events (action, actor_id, aggregate_type, aggregate_id, metadata_json, created_at, updated_at)
               VALUES ('payment.alert', ${input.actorId}, 'ORDER', ${String(order.id)},
                       ${JSON.stringify({ reason: 'REFUND_FAILED' })}::jsonb, now(), now())`,
    })
    return { status: 'refund_failed' }
  }

  await db.execute({
    drizzle: db.drizzle,
    sql: sql`UPDATE orders SET status = 'refunded', updated_at = now() WHERE id = ${order.id}`,
  })
  await db.execute({
    drizzle: db.drizzle,
    sql: sql`INSERT INTO audit_events (action, actor_id, aggregate_type, aggregate_id, metadata_json, created_at, updated_at)
             VALUES ('payment.refund.approved', ${input.actorId}, 'ORDER', ${String(order.id)}, '{}'::jsonb, now(), now())`,
  })
  return { status: 'refunded' }
}
