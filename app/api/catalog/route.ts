import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/telemetry/logger';

export async function GET(): Promise<NextResponse> {
  try {
    const items = await prisma.item.findMany({
      where: { isActive: true },
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
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ items }, { status: 200 });
  } catch (err: unknown) {
    logger.error('Failed to fetch catalog', { error: String(err) });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
