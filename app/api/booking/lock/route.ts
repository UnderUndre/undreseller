import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createSlotHoldLock, SlotConflictError } from '@/lib/booking/lock';
import { verifyTelegramInitData } from '@/lib/security/initData';
import { checkRateLimit } from '@/lib/security/rateLimiter';
import { logger } from '@/lib/telemetry/logger';

const lockRequestSchema = z.object({
  itemId: z.string().uuid(),
  startTime: z.string().datetime(),
  customerName: z.string().trim().min(1).max(100).optional().nullable(),
  customerPhone: z.string().trim().min(1).max(50).optional().nullable(),
  customerEmail: z.string().trim().email().optional().nullable(),
  customerTgId: z.string().trim().min(1).optional().nullable(),
  initData: z.string().trim().optional().nullable(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json();
    const parsed = lockRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
    }

    const { itemId, startTime, customerName, customerPhone, customerEmail, customerTgId, initData } =
      parsed.data;

    let verifiedTgId: string | null = null;

    // Security Check: initData validation vs browser check
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
      // Security Check: Telegram id claimed without initData -> 401
      return NextResponse.json(
        { error: 'Unauthorized: customerTgId provided without valid initData HMAC' },
        { status: 401 }
      );
    } else {
      // Browser checkout requires customerName and customerPhone
      if (!customerName || !customerPhone) {
        return NextResponse.json(
          { error: 'Browser booking requires customerName and customerPhone' },
          { status: 400 }
        );
      }
    }

    // Rate Limiting (10 requests per 60s per identity/IP)
    const rateLimitKey = verifiedTgId || customerPhone || req.headers.get('x-forwarded-for') || 'unknown';
    const rateCheck = checkRateLimit(`lock_${rateLimitKey}`, 10);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: 'Too many booking attempts. Please wait before retrying.' },
        { status: 429 }
      );
    }

    const result = await createSlotHoldLock({
      itemId,
      startTime: new Date(startTime),
      customerName: customerName ?? null,
      customerPhone: customerPhone ?? null,
      customerEmail: customerEmail ?? null,
      customerTgId: verifiedTgId,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof SlotConflictError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }

    logger.error('Failed to acquire slot lock', { error: String(err) });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
