import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { verifyTelegramInitData } from '@/lib/security/initData';
import { checkRateLimit } from '@/lib/security/rateLimiter';
import { logger } from '@/lib/telemetry/logger';
import { dispatchStaffOrderPagerCard } from '@/lib/bot/staffBot';
import { getPrimaryPaymentProvider } from '@/lib/payments/providerContract';
import '@/lib/payments/nowpayments'; // side-effect: registers the NOWPAYMENTS factory (FR-401)

const checkoutSchema = z
  .object({
    itemId: z.string().uuid().optional(),
    orderId: z.string().uuid().optional(),
    paymentMethod: z.enum(['PAY_ON_SITE', 'TELEGRAM_STARS', 'CRYPTO_GATEWAY']),
    paymentType: z.enum(['PAY_ON_SITE', 'PREPAYMENT_ONLINE']).optional(),
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
      if (!customerName || !customerPhone) {
        return NextResponse.json(
          { error: 'Browser checkout requires customerName and customerPhone' },
          { status: 400 }
        );
      }
    }

    const rateLimitKey =
      verifiedTgId || customerPhone || req.headers.get('x-forwarded-for') || 'anon';
    const rateCheck = checkRateLimit(`checkout_${rateLimitKey}`, 10);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: 'Too many checkout attempts. Please wait.' },
        { status: 429 }
      );
    }

    const settings = await prisma.shopSettings.findUnique({ where: { id: 1 } });
    const prepaymentTiming = settings?.prepaymentTiming || 'IMMEDIATE';
    const staffChatId = settings?.staffDestinationChatId || process.env.STAFF_CHAT_ID || null;

    // Scenario A: Existing reservation order
    if (orderId) {
      const existingOrder = await prisma.order.findUnique({
        where: { id: orderId },
        include: { reservation: true, items: { include: { item: true } } },
      });

      if (
        !existingOrder ||
        (existingOrder.status !== 'PENDING' && existingOrder.status !== 'AWAITING_PAYMENT')
      ) {
        return NextResponse.json(
          { error: 'Order not found or no longer payable' },
          { status: 404 }
        );
      }

      const resolvedPaymentType =
        paymentMethod === 'PAY_ON_SITE' ? 'PAY_ON_SITE' : 'PREPAYMENT_ONLINE';

      const updated = await prisma.order.update({
        where: { id: orderId },
        data: {
          paymentMethod: paymentMethod as never,
          paymentType: resolvedPaymentType,
        },
      });

      // Notify Staff Bot pager card if configured
      if (staffChatId && existingOrder.reservation) {
        await dispatchStaffOrderPagerCard(
          {
            orderId: updated.id,
            orderNumber: updated.orderNumber,
            serviceTitles: existingOrder.items.map(
              (i) => i.titleSnapshot || i.item?.title || 'Service'
            ),
            totalDurationMin: existingOrder.reservation.totalDurationMin || 60,
            startTimeIso: existingOrder.reservation.startTime.toISOString(),
            endTimeIso: existingOrder.reservation.endTime.toISOString(),
            totalMinor: updated.totalMinor,
            currency: updated.currency,
            paymentType: resolvedPaymentType,
            customerName: updated.customerName,
            customerPhone: updated.customerPhone,
            customerTgUsername: updated.customerTgUsername,
            hasWhatsApp: updated.hasWhatsApp,
            hasTelegram: updated.hasTelegram,
            hasCustomerNotes: Boolean(updated.customerNotes),
            customerNotes: updated.customerNotes,
            isNewClient: updated.autoCancelOnNoConfirmation,
          },
          staffChatId
        );
      }

      // 1. Pay on site -> no external gateway redirection
      if (paymentMethod === 'PAY_ON_SITE') {
        return NextResponse.json(
          {
            order: updated,
            paymentMethod: 'PAY_ON_SITE',
            paymentType: 'PAY_ON_SITE',
          },
          { status: 200 }
        );
      }

      // 2. Online prepayment with AFTER_STAFF_APPROVAL while still waiting for staff review
      if (
        prepaymentTiming === 'AFTER_STAFF_APPROVAL' &&
        updated.status === 'PENDING' &&
        updated.confirmationStatus === 'PENDING_STAFF_REVIEW'
      ) {
        return NextResponse.json(
          {
            order: updated,
            paymentMethod,
            paymentType: 'PREPAYMENT_ONLINE',
            deferredUntilStaffApproval: true,
          },
          { status: 200 }
        );
      }

      const invoiceData = await createCheckoutInvoice(
        updated.id,
        updated.totalMinor,
        updated.currency,
        paymentMethod,
        req.nextUrl.origin
      );
      if ('error' in invoiceData) {
        return NextResponse.json({ error: invoiceData.error }, { status: invoiceData.status });
      }
      return NextResponse.json({ order: updated, ...invoiceData }, { status: 200 });
    }

    // Scenario B: Product order
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
    const resolvedPaymentType =
      paymentMethod === 'PAY_ON_SITE' ? 'PAY_ON_SITE' : 'PREPAYMENT_ONLINE';

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
        paymentMethod: paymentMethod as never,
        paymentType: resolvedPaymentType,
        items: {
          create: {
            itemId: item.id,
            titleSnapshot: item.title,
            currency: item.currency,
            quantity: 1,
            priceMinor: item.priceMinor,
            stockDecremented: 0,
          },
        },
      },
    });

    // Notify Staff Bot pager card if configured (FR-008)
    if (staffChatId) {
      await dispatchStaffOrderPagerCard(
        {
          orderId: newOrder.id,
          orderNumber: newOrder.orderNumber,
          serviceTitles: [item.title],
          totalDurationMin: 0, // Product orders don't have duration
          startTimeIso: new Date().toISOString(),
          endTimeIso: new Date().toISOString(),
          totalMinor: newOrder.totalMinor,
          currency: newOrder.currency,
          paymentType: resolvedPaymentType,
          customerName: newOrder.customerName,
          customerPhone: newOrder.customerPhone,
          customerTgUsername: newOrder.customerTgUsername,
          hasWhatsApp: newOrder.hasWhatsApp,
          hasTelegram: newOrder.hasTelegram,
          hasCustomerNotes: false, // Product orders don't have notes
          customerNotes: null,
          isNewClient: true, // Product orders are always new clients
        },
        staffChatId
      );
    }

    if (paymentMethod === 'PAY_ON_SITE') {
      return NextResponse.json(
        { order: newOrder, paymentMethod: 'PAY_ON_SITE', paymentType: 'PAY_ON_SITE' },
        { status: 201 }
      );
    }

    const invoiceData = await createCheckoutInvoice(
      newOrder.id,
      newOrder.totalMinor,
      newOrder.currency,
      paymentMethod,
      req.nextUrl.origin
    );
    if ('error' in invoiceData) {
      return NextResponse.json({ error: invoiceData.error }, { status: invoiceData.status });
    }
    return NextResponse.json({ order: newOrder, ...invoiceData }, { status: 201 });
  } catch (err: unknown) {
    logger.error('Failed to process checkout', { error: String(err) });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * T022 (contracts/payment-provider.md): crypto invoices are created SERVER-SIDE
 * through the PaymentProvider contract — the payment URL is always
 * provider-issued. The legacy hand-built `nowpayments.io/payment/?iid=...` URL
 * branch (003 audit finding) is removed; hand-assembled gateway URLs are prohibited.
 * Zero-provider mode: PAY_ON_SITE and TELEGRAM_STARS remain fully functional;
 * CRYPTO_GATEWAY checkout is unavailable (503) — booking free-track unaffected (FR-401).
 */
async function createCheckoutInvoice(
  orderId: string,
  totalMinor: number,
  currency: string,
  method: 'TELEGRAM_STARS' | 'CRYPTO_GATEWAY',
  callbackBaseUrl: string
):
  Promise<
    | { paymentMethod: 'TELEGRAM_STARS'; starsPrice: number }
    | { paymentMethod: 'CRYPTO_GATEWAY'; invoiceUrl: string }
    | { error: string; status: number }
  > {
  if (method === 'TELEGRAM_STARS') {
    const calculatedStars = Math.max(1, Math.round(totalMinor / 2));
    return {
      paymentMethod: 'TELEGRAM_STARS',
      starsPrice: calculatedStars,
    };
  }

  const provider = getPrimaryPaymentProvider();
  if (!provider || provider.id !== 'NOWPAYMENTS') {
    return {
      error: 'Crypto gateway is not configured for this store',
      status: 503,
    };
  }

  try {
    const invoice = await provider.createInvoice({
      orderId,
      amountMinor: totalMinor,
      currency,
      callbackBaseUrl,
    });
    // FE compatibility: the historical field name is `invoiceUrl`; the VALUE is
    // now the provider-issued payment URL.
    return { paymentMethod: 'CRYPTO_GATEWAY', invoiceUrl: invoice.paymentUrl };
  } catch (err: unknown) {
    logger.error('Provider invoice creation failed', { error: String(err), orderId });
    return { error: 'Failed to create payment invoice', status: 502 };
  }
}
