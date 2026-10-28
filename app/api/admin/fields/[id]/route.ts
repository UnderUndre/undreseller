import { NextRequest, NextResponse } from 'next/server';
import { authenticateStaff } from '@/lib/security/staffAuth';
import { updateField } from '@/lib/kernel/customFieldService';
import { logger } from '@/lib/telemetry/logger';
import { adminFieldUpdateSchema } from '@/lib/validation/adminSchemas';

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const auth = await authenticateStaff(req, 'OPERATOR');
  if (!auth.authenticated) return auth.errorResponse!;

  const { id } = await ctx.params;

  try {
    const body = await req.json();
    const parsed = adminFieldUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
    }

    const field = await updateField(id, parsed.data, auth.actor!);
    return NextResponse.json({ field }, { status: 200 });
  } catch (err: unknown) {
    const status = (err as { statusCode?: number }).statusCode ?? 400;
    if (status >= 500) {
      logger.error('Failed to update admin custom field', { error: String(err) });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update field' },
      { status }
    );
  }
}
