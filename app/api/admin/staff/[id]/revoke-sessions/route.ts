import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { authenticateStaff, emitAuditEvent } from '@/lib/security/staffAuth';
import { logger } from '@/lib/telemetry/logger';

const revokeSchema = z.object({
  deactivateAccount: z.boolean().default(false),
  reason: z.string().trim().min(3).max(500),
});

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
): Promise<NextResponse> {
  const auth = await authenticateStaff(req, 'OWNER');
  if (!auth.authenticated) return auth.errorResponse!;

  try {
    const { id } = await context.params;
    const body = await req.json().catch(() => ({}));
    const parsed = revokeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
    }

    const { deactivateAccount, reason } = parsed.data;

    const staff = await prisma.staffMember.findUnique({
      where: { id },
    });

    if (!staff) {
      return NextResponse.json({ error: 'Staff member not found' }, { status: 404 });
    }

    // 1. Delete all database sessions for the linked Better Auth user
    const deletedSessions = await prisma.session.deleteMany({
      where: { userId: staff.authUserId },
    });

    // 2. If deactivate requested, mark staff inactive and unpublish profile
    if (deactivateAccount) {
      await prisma.$transaction([
        prisma.staffMember.update({
          where: { id },
          data: { active: false },
        }),
        prisma.professionalProfile.updateMany({
          where: { staffMemberId: id },
          data: { isPublished: false },
        }),
      ]);
    }

    await emitAuditEvent({
      action: 'STAFF_SESSIONS_REVOKED',
      actorId: auth.actor!.actorId,
      actorRole: auth.actor!.actorRole,
      aggregateType: 'STAFF_MEMBER',
      aggregateId: staff.id,
      reason,
      metadataJson: {
        revokedSessionsCount: deletedSessions.count,
        accountDeactivated: deactivateAccount,
      },
    });

    return NextResponse.json({
      message: 'Staff sessions successfully revoked',
      revokedSessionsCount: deletedSessions.count,
      accountDeactivated: deactivateAccount,
    });
  } catch (err: unknown) {
    logger.error('Failed to revoke staff sessions', { error: String(err) });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
