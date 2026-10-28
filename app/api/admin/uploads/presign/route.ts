/**
 * Presigned URL Issuer (T060, FR-441)
 * OWNER/OPERATOR only, rate-limited, validated inputs. Thin controller over
 * lib/uploads/presign.ts (FR-435: no business logic in the route).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateStaff } from '@/lib/security/staffAuth';
import { emitAuditEvent } from '@/lib/security/staffAuth';
import { createPresignedPut, PresignValidationError } from '@/lib/uploads/presign';
import { enforceRateLimit, rateLimitKey } from '@/lib/security/rateLimit';
import { logger } from '@/lib/telemetry/logger';

const presignSchema = z.object({
  contentType: z.string().max(100),
  contentLength: z.number().int().positive(),
  folder: z.string().max(50),
  extension: z.string().max(5).optional(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await authenticateStaff(req, 'OPERATOR');
  if (!auth.authenticated || !auth.actor) {
    return auth.errorResponse ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // T091 (FR-427): shared sliding-window limiter, 30 presigns / 5 min per actor.
  if (
    !enforceRateLimit(rateLimitKey('presign', auth.actor.actorId), 30, 5 * 60 * 1000).allowed
  ) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = presignSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  try {
    const result = await createPresignedPut(parsed.data);

    await emitAuditEvent({
      action: 'UPLOAD_PRESIGNED',
      actorId: auth.actor.actorId,
      actorRole: auth.actor.actorRole,
      aggregateType: 'MEDIA',
      aggregateId: result.key,
      metadataJson: { folder: parsed.data.folder, contentType: parsed.data.contentType },
    });

    return NextResponse.json(result, { status: 200 });
  } catch (err: unknown) {
    if (err instanceof PresignValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    logger.error('[PRESIGN_FAILED]', { error: String(err) });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Presign failed' },
      { status }
    );
  }
}
