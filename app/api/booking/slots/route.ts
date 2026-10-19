import { NextRequest, NextResponse } from 'next/server';
import { getAvailableSlots } from '@/lib/booking/windows';
import { logger } from '@/lib/telemetry/logger';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const itemId = searchParams.get('itemId');
  const date = searchParams.get('date');

  if (!itemId || !date) {
    return NextResponse.json(
      { error: 'Missing required query parameters: itemId and date (YYYY-MM-DD)' },
      { status: 400 }
    );
  }

  // Validate date format YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json(
      { error: 'Invalid date format. Expected YYYY-MM-DD' },
      { status: 400 }
    );
  }

  try {
    const slots = await getAvailableSlots(itemId, date);
    return NextResponse.json({ itemId, date, slots }, { status: 200 });
  } catch (err: unknown) {
    logger.error('Failed to get booking slots', { error: String(err), itemId, date });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
