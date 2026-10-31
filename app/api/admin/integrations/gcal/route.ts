/**
 * T020/T024 (FR-601, FR-604): integration status + disconnect.
 * GET — per-resource statuses (health); DELETE — full wipe (token + sync state).
 * Strictly OWNER.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { authenticateStaff, emitAuditEvent } from '@/lib/security/staffAuth';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await authenticateStaff(req, 'OPERATOR');
  if (!auth.authenticated || !auth.actor) {
    return auth.errorResponse ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const credentials = await prisma.integrationCredential.findMany({
    where: { provider: 'GOOGLE_CALENDAR' },
    select: {
      id: true,
      resourceId: true,
      status: true,
      lastSyncAt: true,
      lastError: true,
      connectedByStaffId: true,
      updatedAt: true,
    },
    orderBy: [{ resourceId: 'asc' }],
  });

  return NextResponse.json({ credentials });
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const auth = await authenticateStaff(req, 'OWNER');
  if (!auth.authenticated || !auth.actor) {
    return auth.errorResponse ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const resourceIdParam = req.nextUrl.searchParams.get('resourceId');
  const resourceId = resourceIdParam && resourceIdParam !== 'default_master' ? resourceIdParam : null;

  const credential = await prisma.integrationCredential.findFirst({
    where: { provider: 'GOOGLE_CALENDAR', resourceId },
  });
  if (!credential) {
    return NextResponse.json({ error: 'No credential for this resource' }, { status: 404 });
  }

  // Full wipe: token (irrecoverable) + sync state (ExternalBusyBlock rows are
  // resource-owned and cleaned by the resource cascade/cycle; F10-rev notes
  // GC-side orphan events remain — runbook T061).
  await prisma.integrationCredential.delete({ where: { id: credential.id } });
  await prisma.externalBusyBlock.deleteMany({ where: { resourceId } });

  await emitAuditEvent({
    action: 'GCAL_DISCONNECTED',
    actorId: auth.actor.actorId,
    actorRole: auth.actor.actorRole,
    aggregateType: 'INTEGRATION_CREDENTIAL',
    aggregateId: credential.id,
    metadataJson: { resourceId },
  });

  return NextResponse.json({ ok: true });
}
