import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { computeAvailableSlots } from '@/lib/booking/windows';
import { logger } from '@/lib/telemetry/logger';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const serviceId = searchParams.get('serviceId') || searchParams.get('itemId');
  const date = searchParams.get('date');
  const modeParam = (searchParams.get('mode') || 'IN_CALL').toUpperCase();
  const professionalId = searchParams.get('professionalId') || searchParams.get('resourceId');

  if (!serviceId || !date) {
    return NextResponse.json(
      { error: 'Missing required query parameters: serviceId and date (YYYY-MM-DD)' },
      { status: 400 }
    );
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { error: 'Invalid date format. Expected YYYY-MM-DD' },
      { status: 400 }
    );
  }

  const fulfillmentMode = modeParam === 'OUT_CALL' ? 'OUT_CALL' : 'IN_CALL';

  try {
    const [item, settings] = await Promise.all([
      prisma.item.findFirst({
        where: { id: serviceId, itemType: 'SERVICE', isActive: true },
      }),
      prisma.shopSettings.findUnique({ where: { id: 1 } }),
    ]);

    if (!item) {
      return NextResponse.json({ error: 'Service not found or inactive' }, { status: 404 });
    }

    // Resolve resource
    let resourceId = 'default_master';
    if (professionalId) {
      const profile = await prisma.professionalProfile.findFirst({
        where: {
          OR: [{ id: professionalId }, { slug: professionalId }],
          isPublished: true,
          staffMember: { active: true },
        },
        include: { staffMember: true },
      });
      if (profile?.staffMember?.resourceId) {
        resourceId = profile.staffMember.resourceId;
      }
    }

    const slots = await computeAvailableSlots({
      dateStr: date,
      durationMin: item.durationMin || 60,
      fulfillmentMode,
      bufferBeforeMin: item.bufferBeforeMin,
      bufferAfterMin: item.bufferAfterMin,
      outCallTravelBeforeMin: item.outCallTravelBeforeMin,
      outCallTravelAfterMin: item.outCallTravelAfterMin,
      slotGridStepMin: settings?.slotGridStepMin || 30,
      timeZone: settings?.timeZone || 'UTC',
      resourceId,
    });

    return NextResponse.json(
      {
        serviceId: item.id,
        serviceTitle: item.title,
        fulfillmentMode,
        resourceId,
        date,
        timeZone: settings?.timeZone || 'UTC',
        slots,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    logger.error('Failed to get booking slots', { error: String(err), serviceId, date });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
