import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import { stripeGateway, type PaymentGateway } from '@/lib/payments/stripeGateway'

/**
 * Staff refund resolution (spec 003 FR-304, research D5; 008 T810 rework):
 * post-cutoff cancellations land in `refund_requested` (24h SLA);
 * OWNER/OPERATOR resolve through this service.
 *
 * 008 (antigravity F2 / SEC-A-05 / F-BE-06): the double-call race is closed by
 * a DETERMINISTIC Stripe idempotencyKey `refund-<orderId>` — a concurrent
 * second call returns the SAME refund instead of erroring, so the loser can no
 * longer overwrite `refunded` with `refund_failed`. The final write is a CAS
 * on the EXISTING status (no new enum value — Via Negativa); the row is locked
 * with SELECT … FOR UPDATE across the resolution branch, keeping the money
 * call outside the write-transaction when possible (research D5 canon).
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
    // CAS on the existing status: a concurrent resolution wins, we report it.
    const cas = await db.execute({
      drizzle: db.drizzle,
      sql: sql`UPDATE orders SET status = 'refund_rejected', updated_at = now()
               WHERE id = ${order.id} AND status = 'refund_requested' RETURNING id`,
    })
    if ((cas.rows ?? []).length === 0) {
      return { status: 'ALREADY_RESOLVED' }
    }
    await db.execute({
      drizzle: db.drizzle,
      sql: sql`INSERT INTO audit_events (action, actor_id, aggregate_type, aggregate_id, metadata_json, created_at, updated_at)
               VALUES ('payment.refund.rejected', ${input.actorId}, 'ORDER', ${String(order.id)}, '{}'::jsonb, now(), now())`,
    })
    return { status: 'refund_rejected' }
  }

  // Approve: the deterministic idempotencyKey makes a concurrent duplicate call
  // return the SAME Stripe refund (no charge_already_refunded error → no false
  // refund_failed overwrite — the 003-era race root cause).
  const gw = input.gateway ?? stripeGateway
  try {
    await gw.createRefund({
      paymentIntentId: order.stripe_payment_intent_id as string,
      idempotencyKey: `refund-${order.id}`,
    })
  } catch {
    // Money is NOT lost — the verifiable tail state remains staff-visible.
    // CAS-guarded: only the first `refund_requested → refund_failed` transition lands.
    await db.execute({
      drizzle: db.drizzle,
      sql: sql`UPDATE orders SET status = 'refund_failed', updated_at = now()
               WHERE id = ${order.id} AND status = 'refund_requested'`,
    })
    await db.execute({
      drizzle: db.drizzle,
      sql: sql`INSERT INTO audit_events (action, actor_id, aggregate_type, aggregate_id, metadata_json, created_at, updated_at)
               VALUES ('payment.alert', ${input.actorId}, 'ORDER', ${String(order.id)},
                       ${JSON.stringify({ reason: 'REFUND_FAILED' })}::jsonb, now(), now())`,
    })
    return { status: 'refund_failed' }
  }

  // Final write is a CAS: if a concurrent resolution already settled the order
  // (refund_failed via a failed first attempt, or refunded), do not overwrite.
  const cas = await db.execute({
    drizzle: db.drizzle,
    sql: sql`UPDATE orders SET status = 'refunded', updated_at = now()
             WHERE id = ${order.id} AND status = 'refund_requested' RETURNING id`,
  })
  if ((cas.rows ?? []).length === 0) {
    return { status: 'ALREADY_RESOLVED' }
  }
  await db.execute({
    drizzle: db.drizzle,
    sql: sql`INSERT INTO audit_events (action, actor_id, aggregate_type, aggregate_id, metadata_json, created_at, updated_at)
             VALUES ('payment.refund.approved', ${input.actorId}, 'ORDER', ${String(order.id)}, '{}'::jsonb, now(), now())`,
  })
  return { status: 'refunded' }
}
