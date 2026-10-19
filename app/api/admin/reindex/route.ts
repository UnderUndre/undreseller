import { NextRequest, NextResponse } from 'next/server';
import { inngest } from '@/lib/jobs/inngest';
import { authenticateAdmin } from '@/lib/security/adminAuth';
import { logger } from '@/lib/telemetry/logger';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = authenticateAdmin(req);
  if (!auth.authenticated) {
    return auth.errorResponse!;
  }

  try {
    await inngest.send({
      name: 'knowledge/reindex.requested',
      data: {
        requestedAt: new Date().toISOString(),
      },
    });

    logger.adminAction('/api/admin/reindex', 'POST', 'knowledge_reindex', 202);
    return NextResponse.json(
      { success: true, message: 'Knowledge reindex queued successfully' },
      { status: 202 }
    );
  } catch (err: unknown) {
    logger.error('Failed to queue knowledge reindex', { error: String(err) });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
