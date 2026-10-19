import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ItemType } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { authenticateAdmin } from '@/lib/security/adminAuth';
import { logger } from '@/lib/telemetry/logger';

const baseItemSchema = z.object({
  slug: z.string().trim().min(1).max(100),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(2000),
  priceMinor: z.number().int().min(0),
  starsPrice: z.number().int().min(0).optional().nullable(),
  currency: z.string().trim().length(3).toUpperCase(),
  imageUrl: z.string().trim().url().optional().nullable(),
  itemType: z.nativeEnum(ItemType),
  stock: z.number().int().min(0).optional().nullable(),
  durationMin: z.number().int().min(1).optional().nullable(),
  isActive: z.boolean().optional().default(true),
});

const createItemSchema = baseItemSchema.refine(
  (data) => {
    if (data.itemType === ItemType.SERVICE) {
      return (
        (data.stock === null || data.stock === undefined) &&
        data.durationMin !== null &&
        data.durationMin !== undefined &&
        data.durationMin > 0
      );
    }
    return (
      data.stock !== null &&
      data.stock !== undefined &&
      data.stock >= 0 &&
      (data.durationMin === null || data.durationMin === undefined)
    );
  },
  {
    message:
      'SERVICE must have null/undefined stock and positive durationMin; PRODUCT must have non-negative stock and null/undefined durationMin',
  }
);

const patchItemSchema = baseItemSchema.partial().extend({
  id: z.string().uuid(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = authenticateAdmin(req);
  if (!auth.authenticated) {
    return auth.errorResponse!;
  }

  try {
    const body = await req.json();
    const parsed = createItemSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
    }

    const item = await prisma.item.create({
      data: parsed.data,
    });

    logger.adminAction('/api/admin/items', 'POST', item.id, 201);
    return NextResponse.json({ item }, { status: 201 });
  } catch (err: unknown) {
    logger.error('Failed to create item', { error: String(err) });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const auth = authenticateAdmin(req);
  if (!auth.authenticated) {
    return auth.errorResponse!;
  }

  try {
    const body = await req.json();
    const parsed = patchItemSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
    }

    const { id, ...data } = parsed.data;
    const item = await prisma.item.update({
      where: { id },
      data,
    });

    logger.adminAction('/api/admin/items', 'PATCH', item.id, 200);
    return NextResponse.json({ item }, { status: 200 });
  } catch (err: unknown) {
    logger.error('Failed to update item', { error: String(err) });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
