import { NextRequest, NextResponse } from 'next/server';
import { getPublicProfileBySlug } from '@/lib/kernel/professionalProfileService';
import { logger } from '@/lib/telemetry/logger';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ slug: string }> | { slug: string } }
): Promise<NextResponse> {
  try {
    const resolvedParams = await context.params;
    const slug = (resolvedParams.slug || '').trim().toLowerCase();

    if (!slug) {
      return NextResponse.json({ error: 'Professional slug is required' }, { status: 400 });
    }

    const profile = await getPublicProfileBySlug(slug);
    if (!profile) {
      return NextResponse.json({ error: 'Professional not found' }, { status: 404 });
    }

    return NextResponse.json({ profile }, { status: 200 });
  } catch (err: unknown) {
    logger.error('Failed to fetch public professional profile', { error: String(err) });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
