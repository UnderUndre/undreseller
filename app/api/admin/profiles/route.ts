import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { authenticateStaff, emitAuditEvent } from '@/lib/security/staffAuth';
import { logger } from '@/lib/telemetry/logger';
import { HTML_TAG_REGEX, SAFE_URL_REGEX } from '@/config/shop.config';

const createProfileSchema = z.object({
  staffMemberId: z.string().uuid(),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and dashes'),
  headline: z.string().trim().max(200).refine((v) => !HTML_TAG_REGEX.test(v)).nullable().optional(),
  biography: z.string().trim().max(2000).refine((v) => !HTML_TAG_REGEX.test(v)).nullable().optional(),
  photoUrl: z.string().trim().max(500).refine((v) => SAFE_URL_REGEX.test(v)).nullable().optional(),
  isPublished: z.boolean().default(false),
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await authenticateStaff(req, 'PERFORMER');
  if (!auth.authenticated) return auth.errorResponse!;

  try {
    const actor = auth.actor!;
    const isPerformerOnly = actor.actorRole === 'PERFORMER';

    const profiles = await prisma.professionalProfile.findMany({
      where: isPerformerOnly ? { staffMemberId: actor.actorId } : {},
      include: {
        staffMember: { select: { id: true, displayName: true, role: true, active: true } },
        portfolioItems: { orderBy: { sortOrder: 'asc' } },
        services: { include: { item: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ profiles }, { status: 200 });
  } catch (err: unknown) {
    logger.error('Failed to list admin profiles', { error: String(err) });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await authenticateStaff(req, 'OPERATOR');
  if (!auth.authenticated) return auth.errorResponse!;

  try {
    const body = await req.json();
    const parsed = createProfileSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
    }

    const { staffMemberId, slug, headline, biography, photoUrl, isPublished } = parsed.data;

    // Verify staff exists and doesn't already have a profile
    const staff = await prisma.staffMember.findUnique({ where: { id: staffMemberId } });
    if (!staff) {
      return NextResponse.json({ error: 'Staff member not found' }, { status: 404 });
    }

    const profile = await prisma.professionalProfile.create({
      data: {
        staffMemberId,
        slug: slug.toLowerCase(),
        headline,
        biography,
        photoUrl,
        isPublished,
      },
      include: { staffMember: true },
    });

    await emitAuditEvent({
      action: 'PROFESSIONAL_PROFILE_CREATED',
      actorId: auth.actor!.actorId,
      actorRole: auth.actor!.actorRole,
      aggregateType: 'PROFESSIONAL_PROFILE',
      aggregateId: profile.id,
      reason: `Staff created professional profile for ${staff.displayName}`,
      metadataJson: { slug: profile.slug, staffMemberId },
    });

    return NextResponse.json({ profile }, { status: 201 });
  } catch (err: unknown) {
    logger.error('Failed to create admin profile', { error: String(err) });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
