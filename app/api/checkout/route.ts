import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { verifyTelegramInitData } from '@/lib/security/initData';
import { checkRateLimit } from '@/lib/security/rateLimiter';
import { PaymentMethod } from '@prisma/client';
import { logger } from '@/lib/telemetry/logger';

const checkoutSchema = z
  .object({
    itemId: z.string().uuid().optional(),
    orderId: z.string().uuid().optional(),
    paymentMethod: z.nativeEnum(PaymentMethod),
    customerName: z.string().trim().min(1).max(100).optional().nullable(),
    customerPhone: z.string().trim().min(1).max(50).optional().nullable(),
    customerEmail: z.string().trim().email().optional().nullable(),
    customerTgId: z.string().trim().min(1).optional().nullable(),
    initData: z.string().trim().optional().nullable(),
  })
  .refine((data) => data.itemId || data.orderId, {
    message: 'Either itemId (for new product order) or orderId (for existing reservation) must be provided',
  });

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const parsed = checkoutSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
    }

    const {
      itemId,
      orderId,
      paymentMethod,
      customerName,
      customerPhone,
      customerEmail,
      customerTgId,
      initData,
    } = parsed.data;

    let verifiedTgId: string | null = null;

    // Security Check: initData validation
    if (initData) {
      const verified = verifyTelegramInitData(initData);
      if (!verified.valid || !verified.telegramUserId) {
        return NextResponse.json(
          { error: `Unauthorized: invalid initData (${verified.error || 'unknown error'})` },
          { status: 401 }
        );
      }
      verifiedTgId = verified.telegramUserId;
    } else if (customerTgId) {
      return NextResponse.json(
        { error: 'Unauthorized: customerTgId provided without valid initData HMAC' },
        { status: 401 }
      );
    } else if (!orderId) {
      // Browser checkout for new product order requires name & phone
      if (!customerName || !customerPhone) {
        return NextResponse.json(
          { error: 'Browser checkout requires customerName and customerPhone' },
          { status: 400 }
        );
      }
    }

    // Rate Limiting
    const rateLimitKey = verifiedTgId || customerPhone || req.headers.get('x-forwarded-for') || 'anon';
    const rateCheck = checkRateLimit(`checkout_${rateLimitKey}`, 10);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: 'Too many checkout attempts. Please wait.' },
        { status: 429 }
      );
    }

    // Scenario A: Attach payment rail to existing reservation order
    if (orderId) {
      const existingOrder = await prisma.order.findUnique({
        where: { id: orderId },
        include: { reservation: true, items: { include: { item: true } } },
      });

      if (!existingOrder || existingOrder.status !== 'PENDING') {
        return NextResponse.json({ error: 'Order not found or no longer pending' }, { status: 404 });
      }

      const updated = await prisma.order.update({
        where: { id: orderId },
        data: { paymentMethod },
      });

      const invoiceData = generateInvoiceMetadata(updated.id, updated.totalMinor, paymentMethod);
      return NextResponse.json({ order: updated, ...invoiceData }, { status: 200 });
    }

    // Scenario B: Create a product PENDING order (no reservation)
    const item = await prisma.item.findUnique({
      where: { id: itemId! },
    });

    if (!item || !item.isActive || item.itemType !== 'PRODUCT') {
      return NextResponse.json({ error: 'Product not found or inactive' }, { status: 404 });
    }

    if (item.stock !== null && item.stock <= 0) {
      return NextResponse.json({ error: 'Product is currently out of stock' }, { status: 400 });
    }

    const randomSuffix = Math.random().toString(36).substring(2, 8).toUpperCase();
    const orderNumber = `ORD-${Date.now()}-${randomSuffix}`;

    const newOrder = await prisma.order.create({
      data: {
        orderNumber,
        status: 'PENDING',
        totalMinor: item.priceMinor,
        currency: item.currency,
        customerName: customerName ?? null,
        customerPhone: customerPhone ?? null,
        customerEmail: customerEmail ?? null,
        customerTgId: verifiedTgId,
        paymentMethod,
        items: {
          create: {
            itemId: item.id,
            quantity: 1,
            priceMinor: item.priceMinor,
            stockDecremented: 0,
          },
        },
      },
    });

    const invoiceData = generateInvoiceMetadata(newOrder.id, newOrder.totalMinor, paymentMethod);
    return NextResponse.json({ order: newOrder, ...invoiceData }, { status: 201 });
  } catch (err: unknown) {
    logger.error('Failed to process checkout', { error: String(err) });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function generateInvoiceMetadata(
  orderId: string,
  totalMinor: number,
  method: PaymentMethod
): { paymentMethod: PaymentMethod; invoiceUrl?: string; starsPrice?: number } {
  if (method === PaymentMethod.TELEGRAM_STARS) {
    // 1 Star ≈ 2 cents ($0.02)
    const calculatedStars = Math.max(1, Math.round(totalMinor / 2));
    return {
      paymentMethod: PaymentMethod.TELEGRAM_STARS,
      starsPrice: calculatedStars,
    };
  }

  // CRYPTO_GATEWAY -> NOWPayments hosted invoice mock/URL
  const amountUsd = (totalMinor / 100).toFixed(2);
  const nowpaymentsUrl = `https://nowpayments.io/payment/?iid=${orderId}&amount=${amountUsd}`;

  return {
    paymentMethod: PaymentMethod.CRYPTO_GATEWAY,
    invoiceUrl: nowpaymentsUrl,
  };
}
