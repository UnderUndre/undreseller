import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { authenticateAdmin } from '@/lib/security/adminAuth';
import { authenticateStaff } from '@/lib/security/staffAuth';
import { logger } from '@/lib/telemetry/logger';

const hourEntrySchema = z
  .object({
    itemId: z.string().uuid().optional().nullable(),
    weekday: z.number().int().min(1).max(7),
    startMin: z.number().int().min(0).max(1440),
    endMin: z.number().int().min(0).max(1440),
    breakStartMin: z.number().int().min(0).max(1440).optional().nullable(),
    breakEndMin: z.number().int().min(0).max(1440).optional().nullable(),
  })
  .refine((data) => data.endMin > data.startMin, {
    message: 'endMin must be strictly greater than startMin',
  })
  .refine(
    (data) => {
      const hasBreakStart = data.breakStartMin !== undefined && data.breakStartMin !== null;
      const hasBreakEnd = data.breakEndMin !== undefined && data.breakEndMin !== null;
      if (!hasBreakStart && !hasBreakEnd) return true;
      if (hasBreakStart && hasBreakEnd) {
        return (
          data.breakStartMin! >= data.startMin &&
          data.breakEndMin! <= data.endMin &&
          data.breakEndMin! > data.breakStartMin!
        );
      }
      return false; // both must be set or neither
    },
    {
      message: 'Break must be fully within shift interval with breakEndMin > breakStartMin',
    }
  );

const putHoursSchema = z
  .object({
    itemId: z.string().uuid().optional().nullable(),
    hours: z.array(hourEntrySchema),
  })
  .refine(
    (data) => {
      // Check for overlapping intervals for the same (itemId, weekday)
      const groups = new Map<string, Array<{ startMin: number; endMin: number }>>();
      for (const h of data.hours) {
        const key = `${h.itemId ?? 'global'}_${h.weekday}`;
        const existing = groups.get(key) || [];
        for (const prev of existing) {
          const overlap = Math.max(h.startMin, prev.startMin) < Math.min(h.endMin, prev.endMin);
          if (overlap) return false;
        }
        existing.push({ startMin: h.startMin, endMin: h.endMin });
        groups.set(key, existing);
      }
      return true;
    },
    {
      message: 'Overlapping intervals detected for the same itemId and weekday',
    }
  );

/**
 * GET (T063, US9) — weekly working-hours summary for the admin team page.
 * OPERATOR and above see all; PERFORMER sees only their own resourceId hours.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await authenticateStaff(req, 'PERFORMER');
  if (!auth.authenticated || !auth.actor) {
    return auth.errorResponse ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const where =
      auth.actor.actorRole === 'PERFORMER' && auth.actor.resourceId
        ? { itemId: auth.actor.resourceId }
        : {};

    const hours = await prisma.weeklyHours.findMany({
      where,
      orderBy: [{ itemId: 'asc' }, { weekday: 'asc' }, { startMin: 'asc' }],
    });

    return NextResponse.json({ hours }, { status: 200 });
  } catch (err: unknown) {
    logger.error('Failed to list weekly hours', { error: String(err) });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
  const auth = authenticateAdmin(req);
  if (!auth.authenticated) {
    return auth.errorResponse!;
  }

  try {
    const body = await req.json();
    const parsed = putHoursSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
    }

    const { itemId, hours } = parsed.data;

    // Transaction: replace hours for this itemId
    await prisma.$transaction(async (tx) => {
      if (itemId) {
        await tx.weeklyHours.deleteMany({
          where: { itemId },
        });
      } else {
        await tx.weeklyHours.deleteMany({
          where: { itemId: null },
        });
      }

      if (hours.length > 0) {
        await tx.weeklyHours.createMany({
          data: hours.map((h) => ({
            itemId: itemId || h.itemId || null,
            weekday: h.weekday,
            startMin: h.startMin,
            endMin: h.endMin,
            breakStartMin: h.breakStartMin ?? null,
            breakEndMin: h.breakEndMin ?? null,
          })),
        });
      }
    });

    logger.adminAction('/api/admin/hours', 'PUT', itemId || 'global', 200);
    return NextResponse.json({ success: true, count: hours.length }, { status: 200 });
  } catch (err: unknown) {
    logger.error('Failed to update weekly hours', { error: String(err) });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
