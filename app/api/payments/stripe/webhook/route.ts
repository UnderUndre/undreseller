import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { fulfillPayment } from '@/lib/payments/fulfillment';
import { logger } from '@/lib/telemetry/logger';
import '@/lib/payments/stripe'; // Ensure STRIPE factory registration
import { getPrimaryPaymentProvider } from '@/lib/payments/providerContract';
import { InboxStatus, InboxEventKind, PaymentMethod, Prisma } from '@prisma/client';

/**
 * T031 / FR-514: Stripe Webhook Route Handler.
 * Enforces atomic transaction for InboxEvent deduplication and FSM state transition (F3).
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const rawBody = await req.text();
  const signature = req.headers.get('stripe-signature');

  const provider = getPrimaryPaymentProvider('STRIPE');
  if (!provider) {
    return new NextResponse('Stripe payment provider not configured', { status: 503 });
  }

  if (!provider.verifyCallback(rawBody, signature)) {
    logger.warn('[STRIPE_WEBHOOK_UNAUTHORIZED]', { signaturePresent: Boolean(signature) });
    return new NextResponse('Unauthorized: invalid stripe signature', { status: 401 });
  }

  let event: { id: string; type: string };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new NextResponse('Bad Request: invalid json', { status: 400 });
  }

  const dedupeKey = `stripe_${event.id}`;

  try {
    // F3: Atomic transaction binding InboxEvent insertion and FSM processing
    const processed = await prisma.$transaction(async (tx) => {
      // 1. Check existing inbox event for replay protection
      const existing = await tx.inboxEvent.findUnique({
        where: { dedupeKey },
      });

      if (existing) {
        if (existing.status === InboxStatus.SENT) {
          return { alreadyProcessed: true };
        }
      } else {
        await tx.inboxEvent.create({
          data: {
            provider: PaymentMethod.STRIPE,
            eventId: event.id,
            dedupeKey,
            kind: InboxEventKind.STRIPE_WEBHOOK,
            payloadJson: JSON.parse(rawBody) as Prisma.InputJsonObject,
            status: InboxStatus.PROCESSING,
          },
        });
      }

      // 2. Parse and execute via fulfillment engine
      const parsed = provider.parseCallback(rawBody);

      if (event.type === 'checkout.session.completed' || event.type === 'charge.refunded') {
        await fulfillPayment({
          orderId: parsed.orderId,
          provider: PaymentMethod.STRIPE,
          providerRef: parsed.providerPaymentId,
          amountMinor: parsed.paidMinor,
          currency: 'USD',
        });
      }

      await tx.inboxEvent.update({
        where: { dedupeKey },
        data: { status: InboxStatus.SENT },
      });

      return { alreadyProcessed: false };
    });

    if (processed.alreadyProcessed) {
      return NextResponse.json({ deduplicated: true }, { status: 200 });
    }

    return new NextResponse('OK', { status: 200 });
  } catch (err: unknown) {
    if (typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === 'P2002') {
      return NextResponse.json({ deduplicated: true }, { status: 200 });
    }
    logger.error('[STRIPE_WEBHOOK_PROCESSING_FAILED]', { eventId: event.id, error: String(err) });
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
