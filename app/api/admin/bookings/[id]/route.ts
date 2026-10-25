import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { authenticateStaff, emitAuditEvent } from '@/lib/security/staffAuth';
import { hasMinimumRole } from '@/lib/security/staffRbac';
import { acquireResourceSlotLock } from '@/lib/booking/advisoryLock';
import { logger } from '@/lib/telemetry/logger';

const updateBookingSchema = z.object({
  action: z.enum(['APPROVE_COVERAGE', 'REJECT_COVERAGE', 'COMPLETE', 'CANCEL', 'RESCHEDULE']),
  reason: z.string().trim().max(500).optional(),
});

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const auth = await authenticateStaff(req, 'PERFORMER');
  if (!auth.authenticated) return auth.errorResponse!;

  try {
    const { id } = await context.params;
    const body = await req.json();
    const parsed = updateBookingSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
    }

    const { action, reason } = parsed.data;
    const actor = auth.actor!;

    const reservation = await prisma.slotReservation.findFirst({
      where: { OR: [{ id }, { orderId: id }] },
      include: { order: true, item: true },
    });

    if (!reservation) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    // Role permission enforcement (FR-326, FR-338)
    const isOperatorOrOwner = hasMinimumRole(actor.actorRole, 'OPERATOR');
    const isAssignedPerformer =
      actor.actorRole === 'PERFORMER' &&
      (reservation.resourceId === actor.resourceId || reservation.resourceId === actor.actorId);

    if (action === 'APPROVE_COVERAGE' || action === 'REJECT_COVERAGE') {
      if (!isOperatorOrOwner) {
        return NextResponse.json(
          { error: 'Forbidden: Only OPERATOR or OWNER can approve/reject outcall coverage' },
          { status: 403 }
        );
      }
    } else if (action === 'COMPLETE') {
      if (!isOperatorOrOwner && !isAssignedPerformer) {
        return NextResponse.json(
          { error: 'Forbidden: Performer can only complete their own assigned appointments' },
          { status: 403 }
        );
      }
    } else {
      if (!isOperatorOrOwner) {
        return NextResponse.json(
          { error: 'Forbidden: Rescheduling and cancellation require OPERATOR or OWNER privileges' },
          { status: 403 }
        );
      }
    }

    // Execute state transition under advisory lock
    const updated = await prisma.$transaction(async (tx) => {
      await acquireResourceSlotLock(tx, reservation.resourceId);
      const now = new Date();

      if (action === 'APPROVE_COVERAGE') {
        await tx.slotReservation.update({
          where: { id: reservation.id },
          data: { status: 'BOOKED' },
        });
        await tx.order.update({
          where: { id: reservation.orderId },
          data: { confirmationStatus: 'STAFF_APPROVED' },
        });
      } else if (action === 'REJECT_COVERAGE') {
        // Reject releases reserved slot and revokes cancellation token
        await tx.slotReservation.update({
          where: { id: reservation.id },
          data: {
            status: 'RELEASED',
            cancellationTokenRevokedAt: now,
          },
        });
        await tx.order.update({
          where: { id: reservation.orderId },
          data: {
            status: 'CANCELLED',
            cancellationReason: 'STAFF_REJECTED',
          },
        });
      } else if (action === 'COMPLETE') {
        await tx.order.update({
          where: { id: reservation.orderId },
          data: { status: 'FULFILLED' },
        });
      } else if (action === 'CANCEL') {
        await tx.slotReservation.update({
          where: { id: reservation.id },
          data: {
            status: 'RELEASED',
            cancellationTokenRevokedAt: now,
          },
        });
        await tx.order.update({
          where: { id: reservation.orderId },
          data: {
            status: 'CANCELLED',
            cancellationReason: 'ADMIN_CANCELLED',
          },
        });
      }

      return tx.slotReservation.findUnique({
        where: { id: reservation.id },
        include: { order: true, item: true },
      });
    });

    await emitAuditEvent({
      action: `BOOKING_${action}`,
      actorId: actor.actorId,
      actorRole: actor.actorRole,
      aggregateType: 'BOOKING',
      aggregateId: reservation.id,
      reason: reason || `Staff executed ${action} on booking`,
      metadataJson: { action, orderId: reservation.orderId },
    });

    return NextResponse.json({ booking: updated }, { status: 200 });
  } catch (err: unknown) {
    logger.error('Failed to update booking status', { error: String(err) });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
