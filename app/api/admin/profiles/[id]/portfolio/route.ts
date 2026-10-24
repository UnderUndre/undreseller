/**
 * Admin Portfolio Items (T063, US9, FR-440)
 * Thin controller: ownership via assertProfileOwnership (PERFORMER may only
 * touch their own profile), business logic in professionalProfileService.
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateStaff } from '@/lib/security/staffAuth';
import { addPortfolioItem } from '@/lib/kernel/professionalProfileService';
import { adminPortfolioItemCreateSchema } from '@/lib/validation/adminSchemas';
import { logger } from '@/lib/telemetry/logger';

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
): Promise<NextResponse> {
  const auth = await authenticateStaff(req, 'PERFORMER');
  if (!auth.authenticated || !auth.actor) {
    return auth.errorResponse ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const body = await req.json();
    const parsed = adminPortfolioItemCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const item = await addPortfolioItem(id, parsed.data, auth.actor);
    return NextResponse.json({ portfolioItem: item }, { status: 201 });
  } catch (err: unknown) {
    const status = (err as { statusCode?: number }).statusCode ?? 400;
    logger.error('Failed to add portfolio item', { error: String(err) });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to add portfolio item' },
      { status }
    );
  }
}
