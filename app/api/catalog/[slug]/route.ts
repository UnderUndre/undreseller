import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/telemetry/logger';

export async function GET(
  _req: NextRequest,
  props: { params: Promise<{ slug: string }> }
): Promise<NextResponse> {
  const params = await props.params;
  const { slug } = params;

  if (!slug) {
    return NextResponse.json({ error: 'Missing slug' }, { status: 400 });
  }

  try {
    const item = await prisma.item.findFirst({
      where: {
        slug,
        isActive: true,
      },
      select: {
        id: true,
        slug: true,
        title: true,
        description: true,
        priceMinor: true,
        starsPrice: true,
        currency: true,
        imageUrl: true,
        itemType: true,
        stock: true,
        durationMin: true,
      },
    });

    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    return NextResponse.json({ item }, { status: 200 });
  } catch (err: unknown) {
    logger.error('Failed to fetch item by slug', { error: String(err), slug });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
