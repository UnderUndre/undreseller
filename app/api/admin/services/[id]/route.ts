import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateStaff } from '@/lib/security/staffAuth';
import { getServiceById, updateService } from '@/lib/kernel/serviceService';
import { logger } from '@/lib/telemetry/logger';

const updateServiceSchema = z.object({
  title: z.string().trim().min(2).max(120).optional(),
  description: z.string().trim().max(1000).optional(),
  durationMin: z.number().int().min(15).max(480).optional(),
  priceMinor: z.number().int().min(0).optional(),
  inCallEnabled: z.boolean().optional(),
  outCallEnabled: z.boolean().optional(),
  outCallPriceMinor: z.number().int().min(0).nullable().optional(),
  outCallTravelFeeMinor: z.number().int().min(0).optional(),
  bufferBeforeMin: z.number().int().min(0).max(120).optional(),
  bufferAfterMin: z.number().int().min(0).max(120).optional(),
  outCallTravelBeforeMin: z.number().int().min(0).max(120).optional(),
  outCallTravelAfterMin: z.number().int().min(0).max(120).optional(),
  cancellationCutoffHours: z.number().int().min(1).max(72).optional(),
  isActive: z.boolean().optional(),
});

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
): Promise<NextResponse> {
  const auth = await authenticateStaff(req, 'PERFORMER');
  if (!auth.authenticated) return auth.errorResponse!;

  try {
    const { id } = await context.params;
    const service = await getServiceById(id);
    if (!service) {
      return NextResponse.json({ error: 'Service not found' }, { status: 404 });
    }
    return NextResponse.json({ service }, { status: 200 });
  } catch (err: unknown) {
    logger.error('Failed to fetch service', { error: String(err) });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
): Promise<NextResponse> {
  const auth = await authenticateStaff(req, 'OPERATOR');
  if (!auth.authenticated) return auth.errorResponse!;

  try {
    const { id } = await context.params;
    const body = await req.json();
    const parsed = updateServiceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
    }

    const updated = await updateService(id, parsed.data, auth.actor!);
    return NextResponse.json({ service: updated }, { status: 200 });
  } catch (err: unknown) {
    logger.error('Failed to update service', { error: String(err) });
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to update service' }, { status: 400 });
  }
}
