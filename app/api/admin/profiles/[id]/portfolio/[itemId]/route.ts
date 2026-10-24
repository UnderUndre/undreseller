/**
 * Admin Portfolio Item PATCH (T063, US9, FR-440) — publish toggle & edits.
 * Ownership enforced server-side via assertProfileOwnership.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { authenticateStaff, emitAuditEvent } from '@/lib/security/staffAuth';
import { assertProfileOwnership } from '@/lib/kernel/professionalProfileService';
import { adminPortfolioItemUpdateSchema } from '@/lib/validation/adminSchemas';
import { logger } from '@/lib/telemetry/logger';

const idSchema = z.string().uuid();

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string; itemId: string }> | { id: string; itemId: string } }
): Promise<NextResponse> {
  const auth = await authenticateStaff(req, 'PERFORMER');
  if (!auth.authenticated || !auth.actor) {
    return auth.errorResponse ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id, itemId } = await context.params;
    if (!idSchema.safeParse(itemId).success) {
      return NextResponse.json({ error: 'Invalid portfolio item id' }, { status: 400 });
    }

    // Server-side ownership rule: PERFORMER only own profile (403 otherwise)
    await assertProfileOwnership(id, auth.actor);

    const body = await req.json();
    const parsed = adminPortfolioItemUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const existing = await prisma.portfolioItem.findFirst({
      where: { id: itemId, professionalProfileId: id },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Portfolio item not found' }, { status: 404 });
    }

    const updated = await prisma.portfolioItem.update({
      where: { id: itemId },
      data: {
        ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
        ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
        ...(parsed.data.isPublished !== undefined ? { isPublished: parsed.data.isPublished } : {}),
        ...(parsed.data.sortOrder !== undefined ? { sortOrder: parsed.data.sortOrder } : {}),
      },
    });

    await emitAuditEvent({
      action: 'PORTFOLIO_ITEM_UPDATED',
      actorId: auth.actor.actorId,
      actorRole: auth.actor.actorRole,
      aggregateType: 'PORTFOLIO_ITEM',
      aggregateId: itemId,
      reason: 'Staff updated portfolio item',
      metadataJson: { profileId: id, isPublished: updated.isPublished },
    });

    return NextResponse.json({ portfolioItem: updated }, { status: 200 });
  } catch (err: unknown) {
    const status = (err as { statusCode?: number }).statusCode ?? 400;
    logger.error('Failed to patch portfolio item', { error: String(err) });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update portfolio item' },
      { status }
    );
  }
}
