import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateStaff } from '@/lib/security/staffAuth';
import { listServices, createService } from '@/lib/kernel/serviceService';
import { logger } from '@/lib/telemetry/logger';

const createServiceSchema = z.object({
  title: z.string().trim().min(2).max(120),
  slug: z.string().trim().min(2).max(80).regex(/^[a-z0-9-]+$/).optional(),
  description: z.string().trim().max(1000).default(''),
  durationMin: z.number().int().min(15).max(480).default(60),
  priceMinor: z.number().int().min(0),
  currency: z.string().trim().length(3).toUpperCase().optional(),
  inCallEnabled: z.boolean().default(true),
  outCallEnabled: z.boolean().default(false),
  outCallPriceMinor: z.number().int().min(0).nullable().optional(),
  outCallTravelFeeMinor: z.number().int().min(0).default(0),
  bufferBeforeMin: z.number().int().min(0).max(120).default(0),
  bufferAfterMin: z.number().int().min(0).max(120).default(0),
  outCallTravelBeforeMin: z.number().int().min(0).max(120).default(0),
  outCallTravelAfterMin: z.number().int().min(0).max(120).default(0),
  cancellationCutoffHours: z.number().int().min(1).max(72).default(3),
  isActive: z.boolean().default(true),
});

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await authenticateStaff(req, 'PERFORMER');
  if (!auth.authenticated) return auth.errorResponse!;

  try {
    const services = await listServices();
    return NextResponse.json({ services }, { status: 200 });
  } catch (err: unknown) {
    logger.error('Failed to list admin services', { error: String(err) });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await authenticateStaff(req, 'OPERATOR');
  if (!auth.authenticated) return auth.errorResponse!;

  try {
    const body = await req.json();
    const parsed = createServiceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
    }

    const service = await createService(parsed.data, auth.actor!);
    return NextResponse.json({ service }, { status: 201 });
  } catch (err: unknown) {
    logger.error('Failed to create admin service', { error: String(err) });
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to create service' }, { status: 400 });
  }
}
