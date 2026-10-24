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
import { logger } from '@/lib/telemetry/logger';

const presignSchema = z.object({
  contentType: z.string().max(100),
  contentLength: z.number().int().positive(),
  folder: z.string().max(50),
  extension: z.string().max(5).optional(),
});

// Simple per-actor rate limit: 30 presigns / 5 min (bounded map, small staff count)
const RATE_LIMIT_MAX = 30;
const RATE_WINDOW_MS = 5 * 60 * 1000;
const rateBuckets = new Map<string, number[]>();

function rateLimit(actorId: string): boolean {
  const now = Date.now();
  const bucket = (rateBuckets.get(actorId) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (bucket.length >= RATE_LIMIT_MAX) {
    return false;
  }
  bucket.push(now);
  rateBuckets.set(actorId, bucket);
  return true;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await authenticateStaff(req, 'OPERATOR');
  if (!auth.authenticated || !auth.actor) {
    return auth.errorResponse ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!rateLimit(auth.actor.actorId)) {
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
