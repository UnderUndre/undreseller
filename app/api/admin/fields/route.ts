import { NextRequest, NextResponse } from 'next/server';
import { authenticateStaff } from '@/lib/security/staffAuth';
import { listFields, createField } from '@/lib/kernel/customFieldService';
import { logger } from '@/lib/telemetry/logger';
import { adminFieldCreateSchema } from '@/lib/validation/adminSchemas';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await authenticateStaff(req, 'OPERATOR');
  if (!auth.authenticated) return auth.errorResponse!;

  try {
    const fields = await listFields();
    return NextResponse.json({ fields }, { status: 200 });
  } catch (err: unknown) {
    logger.error('Failed to list admin custom fields', { error: String(err) });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await authenticateStaff(req, 'OPERATOR');
  if (!auth.authenticated) return auth.errorResponse!;

  try {
    const body = await req.json();
    const parsed = adminFieldCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
    }

    const field = await createField(parsed.data, auth.actor!);
    return NextResponse.json({ field }, { status: 201 });
  } catch (err: unknown) {
    const status = (err as { statusCode?: number }).statusCode ?? 400;
    logger.error('Failed to create admin custom field', { error: String(err) });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create field' },
      { status }
    );
  }
}
