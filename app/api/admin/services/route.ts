import { NextRequest, NextResponse } from 'next/server';
import { authenticateStaff } from '@/lib/security/staffAuth';
import { listServices, createService } from '@/lib/kernel/serviceService';
import { logger } from '@/lib/telemetry/logger';
import { adminServiceCreateSchema } from '@/lib/validation/adminSchemas';

const createServiceSchema = adminServiceCreateSchema;

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
