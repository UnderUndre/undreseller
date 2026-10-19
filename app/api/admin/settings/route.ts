import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { authenticateAdmin } from '@/lib/security/adminAuth';
import { logger } from '@/lib/telemetry/logger';
import { greetingSchema } from '@/config/shop.config';

const updateSettingsSchema = z.object({
  currency: z.string().trim().length(3).toUpperCase().optional(),
  greeting: greetingSchema.optional(),
  whatsappTemplateName: z.string().trim().min(1).max(100).optional(),
});

export async function PUT(req: NextRequest): Promise<NextResponse> {
  const auth = authenticateAdmin(req);
  if (!auth.authenticated) {
    return auth.errorResponse!;
  }

  try {
    const body = await req.json();
    const parsed = updateSettingsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
    }

    const settings = await prisma.shopSettings.upsert({
      where: { id: 1 },
      update: parsed.data,
      create: {
        id: 1,
        currency: parsed.data.currency || 'USD',
        greeting: parsed.data.greeting || '👋 Welcome to our store!',
        whatsappTemplateName: parsed.data.whatsappTemplateName || 'order_status_update',
      },
    });

    logger.adminAction('/api/admin/settings', 'PUT', String(settings.id), 200);
    return NextResponse.json({ settings }, { status: 200 });
  } catch (err: unknown) {
    logger.error('Failed to update shop settings', { error: String(err) });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
