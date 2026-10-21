import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { authenticateAdmin } from '@/lib/security/adminAuth';
import { logger } from '@/lib/telemetry/logger';
import { greetingSchema } from '@/config/shop.config';
import { validateIntegrationProfileEnv } from '@/lib/config/integrationProfile';

const updateSettingsSchema = z.object({
  currency: z.string().trim().length(3).toUpperCase().optional(),
  greeting: greetingSchema.optional(),
  whatsappTemplateName: z.string().trim().min(1).max(100).optional(),
  slotGridStepMin: z.number().int().min(15).max(120).optional(),
  confirmationNoticeHours: z.number().int().min(1).max(168).optional(),
  autoCancelDeadlineHours: z.number().int().min(1).max(72).nullable().optional(),
  autoCancelForNewClients: z.boolean().optional(),
  allowPayOnSite: z.boolean().optional(),
  prepaymentTiming: z.enum(['IMMEDIATE', 'AFTER_STAFF_APPROVAL']).optional(),
  enabledExternalIntegration: z
    .enum(['NONE', 'TELEGRAM_BUNDLE', 'WHATSAPP', 'NOWPAYMENTS'])
    .optional(),
  staffDestinationChatId: z.string().trim().min(1).nullable().optional(),
  authorizedStaffUserIds: z.array(z.string().trim().min(1)).optional(),
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

    if (parsed.data.enabledExternalIntegration) {
      const profileCheck = validateIntegrationProfileEnv(
        parsed.data.enabledExternalIntegration,
        process.env
      );
      if (!profileCheck.valid) {
        return NextResponse.json(
          {
            error: 'Integration profile violates Sprint B credential matrix',
            details: profileCheck.errors,
          },
          { status: 400 }
        );
      }
    }

    const settings = await prisma.shopSettings.upsert({
      where: { id: 1 },
      update: parsed.data,
      create: {
        id: 1,
        currency: parsed.data.currency || 'USD',
        greeting: parsed.data.greeting || '👋 Welcome to our store!',
        whatsappTemplateName: parsed.data.whatsappTemplateName || 'order_status_update',
        ...parsed.data,
      },
    });

    logger.adminAction('/api/admin/settings', 'PUT', String(settings.id), 200);
    return NextResponse.json({ settings }, { status: 200 });
  } catch (err: unknown) {
    logger.error('Failed to update shop settings', { error: String(err) });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
