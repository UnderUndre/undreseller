import { NextRequest, NextResponse } from 'next/server';
import { getAvailableSlots } from '@/lib/booking/windows';
import { logger } from '@/lib/telemetry/logger';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const itemIdsParam = searchParams.get('itemIds') || searchParams.get('itemId');
  const date = searchParams.get('date');
  const resourceId = searchParams.get('resourceId') || 'default_master';

  if (!itemIdsParam || !date) {
    return NextResponse.json(
      { error: 'Missing required query parameters: itemIds (or itemId) and date (YYYY-MM-DD)' },
      { status: 400 }
    );
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { error: 'Invalid date format. Expected YYYY-MM-DD' },
      { status: 400 }
    );
  }

  const itemIds = itemIdsParam
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);

  if (itemIds.length === 0 || itemIds.length > 10) {
    return NextResponse.json(
      { error: 'itemIds must contain between 1 and 10 service IDs' },
      { status: 400 }
    );
  }

  try {
    const slots = await getAvailableSlots(itemIds, date, { resourceId });
    return NextResponse.json(
      {
        itemId: itemIds[0],
        itemIds,
        resourceId,
        date,
        slots,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    logger.error('Failed to get booking slots', { error: String(err), itemIds, date, resourceId });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
