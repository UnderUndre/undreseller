import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { authenticateStaff, emitAuditEvent } from '@/lib/security/staffAuth';
import { logger } from '@/lib/telemetry/logger';
import {
  greetingSchema,
  HTML_TAG_REGEX,
  SAFE_URL_REGEX,
  contactLinkSchema,
} from '@/config/shop.config';
import { isValidCurrency } from '@/config/currency-registry';
import { validateIntegrationProfileEnv } from '@/lib/config/integrationProfile';

const updateSettingsSchema = z.object({
  // Business branding & identity (FR-335)
  businessName: z
    .string()
    .trim()
    .min(2)
    .max(120)
    .refine((val) => !HTML_TAG_REGEX.test(val), {
      message: 'HTML tags are prohibited in business name',
    })
    .optional(),
  businessDescription: z
    .string()
    .trim()
    .max(1000)
    .refine((val) => !HTML_TAG_REGEX.test(val), {
      message: 'HTML tags are prohibited in business description',
    })
    .nullable()
    .optional(),
  logoUrl: z
    .string()
    .trim()
    .max(500)
    .refine((val) => SAFE_URL_REGEX.test(val), {
      message: 'Logo URL must use https:// or http:// scheme',
    })
    .nullable()
    .optional(),
  defaultLocale: z
    .string()
    .trim()
    .min(2)
    .max(10)
    .regex(/^[a-z]{2}(-[A-Z]{2})?$/)
    .optional(),
  timeZone: z
    .string()
    .trim()
    .min(1)
    .refine(
      (tz) => {
        try {
          Intl.DateTimeFormat(undefined, { timeZone: tz });
          return true;
        } catch {
          return false;
        }
      },
      { message: 'Must be a valid IANA timezone (e.g. UTC, Asia/Yerevan)' }
    )
    .optional(),
  currency: z.string().trim().min(3).max(4).toUpperCase().optional(),
  currencyConfirmed: z.boolean().optional(),

  // Service Location & Modes (FR-338)
  businessServiceAddress: z
    .string()
    .trim()
    .max(500)
    .refine((val) => !HTML_TAG_REGEX.test(val), {
      message: 'HTML tags are prohibited in business address',
    })
    .nullable()
    .optional(),
  businessServiceAddressPublic: z.boolean().optional(),
  outCallCoverageDescription: z
    .string()
    .trim()
    .max(500)
    .refine((val) => !HTML_TAG_REGEX.test(val), {
      message: 'HTML tags are prohibited in coverage description',
    })
    .nullable()
    .optional(),
  requireStaffApprovalForInCall: z.boolean().optional(),
  publicContactLinks: z.array(contactLinkSchema).max(10).optional(),

  // Legacy shop settings
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

/**
 * GET /api/admin/settings
 * Accessible by any authenticated staff member (PERFORMER, OPERATOR, OWNER).
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await authenticateStaff(req, 'PERFORMER');
  if (!auth.authenticated) {
    return auth.errorResponse!;
  }

  try {
    const settings = await prisma.shopSettings.findUnique({
      where: { id: 1 },
    });

    return NextResponse.json({ settings: settings || {} }, { status: 200 });
  } catch (err: unknown) {
    logger.error('Failed to fetch shop settings', { error: String(err) });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PUT /api/admin/settings
 * OWNER only (or break-glass ADMIN_TOKEN) per FR-325, FR-335.
 */
export async function PUT(req: NextRequest): Promise<NextResponse> {
  const auth = await authenticateStaff(req, 'OWNER');
  if (!auth.authenticated) {
    return auth.errorResponse!;
  }

  try {
    const body = await req.json();
    const parsed = updateSettingsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
    }

    const { publicContactLinks, ...directFields } = parsed.data;

    // Validate currency against registry
    if (directFields.currency && !isValidCurrency(directFields.currency)) {
      return NextResponse.json(
        { error: `Currency '${directFields.currency}' is not registered in currency registry` },
        { status: 400 }
      );
    }

    // Validate external integration if requested
    if (directFields.enabledExternalIntegration) {
      const profileCheck = validateIntegrationProfileEnv(
        directFields.enabledExternalIntegration,
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

    const updateData: any = { ...directFields };
    if (publicContactLinks !== undefined) {
      updateData.publicContactLinksJson = publicContactLinks;
    }

    const settings = await prisma.shopSettings.upsert({
      where: { id: 1 },
      update: updateData,
      create: {
        id: 1,
        currency: updateData.currency || 'USD',
        greeting: updateData.greeting || '👋 Welcome to our store!',
        whatsappTemplateName: updateData.whatsappTemplateName || 'order_status_update',
        ...updateData,
      },
    });

    // Record immutable audit event (FR-325b, INV-010)
    await emitAuditEvent({
      action: 'BUSINESS_SETTINGS_UPDATED',
      actorId: auth.actor!.actorId,
      actorRole: auth.actor!.actorRole,
      aggregateType: 'SHOP_SETTINGS',
      aggregateId: '1',
      reason: 'Owner updated business settings and location parameters',
      metadataJson: {
        currency: settings.currency,
        currencyConfirmed: settings.currencyConfirmed,
        timeZone: settings.timeZone,
        businessName: settings.businessName,
      },
    });

    logger.adminAction('/api/admin/settings', 'PUT', String(settings.id), 200);
    return NextResponse.json({ settings }, { status: 200 });
  } catch (err: unknown) {
    logger.error('Failed to update shop settings', { error: String(err) });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
