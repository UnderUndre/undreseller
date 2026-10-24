import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateStaff } from '@/lib/security/staffAuth';
import {
  updateProfile,
  linkServicesToProfile,
  assertProfileOwnership,
} from '@/lib/kernel/professionalProfileService';
import { logger } from '@/lib/telemetry/logger';
import { HTML_TAG_REGEX, SAFE_URL_REGEX } from '@/config/shop.config';

const updateProfileSchema = z.object({
  slug: z.string().trim().min(2).max(80).regex(/^[a-z0-9-]+$/).optional(),
  headline: z.string().trim().max(200).refine((v) => !HTML_TAG_REGEX.test(v)).nullable().optional(),
  biography: z.string().trim().max(2000).refine((v) => !HTML_TAG_REGEX.test(v)).nullable().optional(),
  photoUrl: z.string().trim().max(500).refine((v) => SAFE_URL_REGEX.test(v)).nullable().optional(),
  isPublished: z.boolean().optional(),
  linkedServiceIds: z.array(z.string().uuid()).optional(),
});

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
): Promise<NextResponse> {
  const auth = await authenticateStaff(req, 'PERFORMER');
  if (!auth.authenticated) return auth.errorResponse!;

  try {
    const { id } = await context.params;
    const profile = await assertProfileOwnership(id, auth.actor!);
    return NextResponse.json({ profile }, { status: 200 });
  } catch (err: unknown) {
    const status = (err as { statusCode?: number }).statusCode || 500;
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal server error' }, { status });
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
): Promise<NextResponse> {
  const auth = await authenticateStaff(req, 'PERFORMER');
  if (!auth.authenticated) return auth.errorResponse!;

  try {
    const { id } = await context.params;
    const body = await req.json();
    const parsed = updateProfileSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
    }

    const { linkedServiceIds, ...profileFields } = parsed.data;

    const updated = await updateProfile(id, profileFields, auth.actor!);

    if (linkedServiceIds !== undefined) {
      await linkServicesToProfile(id, linkedServiceIds, auth.actor!);
    }

    return NextResponse.json({ profile: updated }, { status: 200 });
  } catch (err: unknown) {
    logger.error('Failed to patch profile', { error: String(err) });
    const status = (err as { statusCode?: number }).statusCode || 400;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update profile' },
      { status }
    );
  }
}
