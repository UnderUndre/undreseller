import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { verifyNowPaymentsSignature, processNowPaymentsNotification, NowPaymentsIPNPayload } from '@/lib/payments/nowpayments';
import { RAW_BODY_CAP_BYTES, validateCanonicalPayload } from '@/lib/inbox/schemas';
import { logger } from '@/lib/telemetry/logger';
import { Prisma } from '@prisma/client';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rawBody = await req.text();

  if (Buffer.byteLength(rawBody, 'utf-8') > RAW_BODY_CAP_BYTES) {
    return new NextResponse('Payload Too Large', { status: 413 });
  }

  const sigHeader = req.headers.get('x-nowpayments-sig');
  if (!verifyNowPaymentsSignature(rawBody, sigHeader)) {
    logger.warn('Unauthorized NOWPayments IPN webhook attempt: invalid signature');
    return new NextResponse('Unauthorized: invalid signature', { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return new NextResponse('Bad Request: malformed JSON', { status: 400 });
  }

  const paymentId = body.payment_id;
  const orderId = body.order_id;

  if (!paymentId || !orderId) {
    return new NextResponse('Bad Request: missing payment_id or order_id', { status: 400 });
  }

  const canonical = {
    version: 1 as const,
    kind: 'NOWPAYMENTS_WEBHOOK' as const,
    providerRef: String(paymentId),
    orderId: String(orderId),
    paidAmount: Number(body.actually_paid || 0),
    quotedAmount: Number(body.pay_amount || 0),
    currency: String(body.price_currency || 'USD').toUpperCase(),
  };

  const validation = validateCanonicalPayload(canonical);
  if (!validation.success) {
    logger.error('Invalid canonical NOWPayments payload', { error: validation.error });
    return new NextResponse('Bad Request: schema validation failed', { status: 400 });
  }

  try {
    await prisma.inboxEvent.create({
      data: {
        provider: 'NOWPAYMENTS',
        eventId: String(paymentId),
        kind: 'NOWPAYMENTS_WEBHOOK',
        payloadJson: validation.data as Prisma.InputJsonObject,
        status: 'PENDING',
      },
    });
  } catch (err: unknown) {
    if (typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === 'P2002') {
      logger.info('Duplicate NOWPayments webhook ignored', { paymentId });
      return new NextResponse('OK (duplicate)', { status: 200 });
    }
    logger.error('Failed to insert NOWPayments inbox event', { error: String(err) });
  }

  try {
    await processNowPaymentsNotification(body as unknown as NowPaymentsIPNPayload);
    return new NextResponse('OK', { status: 200 });
  } catch (err: unknown) {
    logger.error('Failed to process NOWPayments notification', { error: String(err) });
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
