import { prisma } from '@/lib/db/prisma';
import { emitAuditEvent } from '@/lib/security/staffAuth';
import { logger } from '@/lib/telemetry/logger';

/**
 * T013 / FR-502: Instant mass session revocation and epoch validation (Model A).
 * Increments user.sessionEpoch and deletes all database sessions for the user.
 */
export async function revokeAllStaffAccess(
  userId: string,
  revokedByActorId: string,
  cause: 'deactivated' | 'role_change' | 'compromise'
): Promise<number> {
  try {
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        sessionEpoch: {
          increment: 1,
        },
      },
    });

    const deletedSessions = await prisma.session.deleteMany({
      where: { userId },
    });

    await emitAuditEvent({
      action: 'STAFF_SESSIONS_REVOKED',
      actorId: revokedByActorId,
      aggregateType: 'USER',
      aggregateId: userId,
      reason: `Staff access revoked due to: ${cause}`,
      metadataJson: {
        newSessionEpoch: updatedUser.sessionEpoch,
        revokedSessionsCount: deletedSessions.count,
        cause,
      },
    });

    logger.info('[STAFF_SESSIONS_REVOKED]', {
      userId,
      newSessionEpoch: updatedUser.sessionEpoch,
      count: deletedSessions.count,
      cause,
    });

    return deletedSessions.count;
  } catch (err: unknown) {
    logger.error('Failed to revoke staff sessions', { userId, error: String(err) });
    throw err;
  }
}
