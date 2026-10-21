import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  createSlotHoldLock,
  SlotConflictError,
  ClientBlacklistedError,
} from '@/lib/booking/lock';
import { CartValidationError } from '@/lib/booking/cart';
import { verifyTelegramInitData } from '@/lib/security/initData';
import { checkRateLimit } from '@/lib/security/rateLimiter';
import { logger } from '@/lib/telemetry/logger';

const lockRequestSchema = z
  .object({
    itemId: z.string().min(1).optional(),
    itemIds: z.array(z.string().min(1)).min(1).max(10).optional(),
    resourceId: z.string().trim().min(1).max(100).optional(),
    startTime: z.string().datetime(),
    customerName: z.string().trim().min(1).max(100).optional().nullable(),
    customerPhone: z.string().trim().min(1).max(50).optional().nullable(),
    customerEmail: z.string().trim().email().optional().nullable(),
    customerTgId: z.string().trim().min(1).optional().nullable(),
    customerTgUsername: z.string().trim().min(1).max(64).optional().nullable(),
    hasWhatsApp: z.boolean().optional().default(false),
    hasTelegram: z.boolean().optional().default(false),
    customerNotes: z.string().max(1000).optional().nullable(),
    paymentType: z.enum(['PAY_ON_SITE', 'PREPAYMENT_ONLINE']).optional(),
    initData: z.string().trim().optional().nullable(),
  })
  .refine((data) => (data.itemIds && data.itemIds.length > 0) || Boolean(data.itemId), {
    message: 'Either itemIds array or itemId must be provided',
  });

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const parsed = lockRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
    }

    const {
      itemId,
      itemIds,
      resourceId,
      startTime,
      customerName,
      customerPhone,
      customerEmail,
      customerTgId,
      customerTgUsername,
      hasWhatsApp,
      hasTelegram,
      customerNotes,
      paymentType,
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
    } else {
      if (!customerName || !customerPhone) {
        return NextResponse.json(
          { error: 'Browser booking requires customerName and customerPhone' },
          { status: 400 }
        );
      }
    }

    const rateLimitKey =
      verifiedTgId || customerPhone || req.headers.get('x-forwarded-for') || 'unknown';
    const rateCheck = checkRateLimit(`lock_${rateLimitKey}`, 10);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: 'Too many booking attempts. Please wait before retrying.' },
        { status: 429 }
      );
    }

    const result = await createSlotHoldLock({
      itemId,
      itemIds,
      resourceId: resourceId || 'default_master',
      startTime: new Date(startTime),
      customerName: customerName ?? null,
      customerPhone: customerPhone ?? null,
      customerEmail: customerEmail ?? null,
      customerTgId: verifiedTgId,
      customerTgUsername: customerTgUsername ?? null,
      hasWhatsApp,
      hasTelegram,
      customerNotes: customerNotes ?? null,
      paymentType: paymentType || 'PAY_ON_SITE',
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof ClientBlacklistedError) {
      return NextResponse.json({ error: 'Access restricted' }, { status: 403 });
    }

    if (err instanceof SlotConflictError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }

    if (err instanceof CartValidationError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 400 });
    }

    logger.error('Failed to acquire slot lock', { error: String(err) });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
