import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { authenticateAdmin } from '@/lib/security/adminAuth';
import { normalizePhoneE164 } from '@/lib/booking/lock';
import { logger } from '@/lib/telemetry/logger';

const unblockUserSchema = z
  .object({
    customerTgId: z.string().trim().min(1).optional(),
    phone: z.string().trim().min(1).optional(),
    actor: z.string().trim().min(1).max(120),
    reason: z.string().trim().min(3).max(500),
  })
  .refine((data) => Boolean(data.customerTgId || data.phone), {
    message: 'Either customerTgId or phone must be provided to unblock',
  });

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = authenticateAdmin(req);
  if (!auth.authenticated) {
    return auth.errorResponse!;
  }

  try {
    const body = await req.json();
    const parsed = unblockUserSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
    }

    const { customerTgId, phone, actor, reason } = parsed.data;
    const normalizedPhone = normalizePhoneE164(phone) || phone;
    const now = new Date();

    const conditions: Array<Record<string, unknown>> = [];
    if (customerTgId) {
      conditions.push({ platform: 'TELEGRAM', externalId: customerTgId });
      conditions.push({ customerId: customerTgId });
    }
    if (normalizedPhone) {
      conditions.push({ platform: 'WHATSAPP', externalId: normalizedPhone });
    }

    const updated = await prisma.messengerContact.updateMany({
      where: { OR: conditions },
      data: {
        isBlocked: false,
        requiresManualReview: false,
        phoneRiskExpiresAt: null,
        unblockedBy: actor,
        unblockReason: reason,
        unblockedAt: now,
      },
    });

    logger.info('[CLIENT_UNBLOCKED]', {
      actor,
      reason,
      unblockedCount: updated.count,
      targetTgId: customerTgId ?? null,
    });
    logger.adminAction('/api/admin/users/unblock', 'POST', customerTgId || normalizedPhone, 200);

    return NextResponse.json(
      {
        success: true,
        unblockedCount: updated.count,
        actor,
        reason,
        unblockedAt: now.toISOString(),
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    logger.error('Failed to unblock client', { error: String(err) });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
