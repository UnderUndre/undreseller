import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateAdmin } from '@/lib/security/adminAuth';
import { executeOrderRefund } from '@/lib/payments/refunds';
import { logger } from '@/lib/telemetry/logger';

const refundRequestSchema = z.object({
  kind: z.enum(['TELEGRAM_STARS_REFUND', 'CRYPTO_REIMBURSEMENT']),
  idempotencyKey: z.string().trim().min(4).max(128),
  amountMinor: z.number().int().positive(),
  currency: z.string().trim().length(3).toUpperCase(),
  actor: z.string().trim().min(1).max(120),
  reason: z.string().trim().max(500).optional(),
  telegramUserId: z.string().trim().optional(),
  telegramPaymentChargeId: z.string().trim().optional(),
  asset: z.string().trim().optional(),
  network: z.string().trim().optional(),
  destination: z.string().trim().optional(),
  networkFeeMinor: z.number().int().nonnegative().optional(),
});

export async function POST(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const auth = authenticateAdmin(req);
  if (!auth.authenticated) {
    return auth.errorResponse!;
  }

  const { id: orderId } = await props.params;
  if (!orderId) {
    return NextResponse.json({ error: 'Missing order id' }, { status: 400 });
  }

  try {
    const body = await req.json();
    const parsed = refundRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
    }

    const result = await executeOrderRefund({
      orderId,
      ...parsed.data,
    });

    logger.adminAction(`/api/admin/orders/${orderId}/refund`, 'POST', orderId, 200);
    return NextResponse.json(result, { status: result.deduplicated ? 200 : 201 });
  } catch (err: unknown) {
    logger.error('Failed to process order refund', { error: String(err), orderId });
    return NextResponse.json({ error: String(err) }, { status: 400 });
  }
}
