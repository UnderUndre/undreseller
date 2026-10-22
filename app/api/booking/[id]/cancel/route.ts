import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { cancelBooking, CancellationError } from '@/lib/kernel/bookingService';
import { resolveStaffSession } from '@/lib/security/staffAuth';
import { logger } from '@/lib/telemetry/logger';

const cancelSchema = z.object({
  token: z.string().trim().min(16).max(128).optional(),
  reason: z.string().trim().max(500).optional(),
});

/**
 * GET /api/booking/[id]/cancel
 * GET-Safe Preview Endpoint (INV-014).
 * Side-effect-free preview safe against link-preview bots.
 * Opening this URL NEVER consumes the token or cancels the appointment.
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    const { searchParams } = new URL(req.url);
    const token = searchParams.get('token');

    const reservation = await prisma.slotReservation.findFirst({
      where: { OR: [{ id }, { orderId: id }] },
      include: { item: true, order: true },
    });

    if (!reservation) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    const now = new Date();
    const cutoffHours = reservation.item?.cancellationCutoffHours || 3;
    const apptStart = reservation.appointmentStartTime || reservation.startTime;
    const deadline = new Date(apptStart.getTime() - cutoffHours * 60 * 60 * 1000);
    const canCancel = reservation.status !== 'RELEASED' && now <= deadline;

    return NextResponse.json(
      {
        preview: {
          bookingId: reservation.id,
          orderNumber: reservation.order.orderNumber,
          serviceTitle: reservation.item?.title || 'Appointment',
          startsAt: apptStart.toISOString(),
          status: reservation.status,
          cancellationCutoffHours: cutoffHours,
          canCancel,
          hasProvidedToken: Boolean(token),
        },
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store',
          'Referrer-Policy': 'no-referrer',
        },
      }
    );
  } catch (err: unknown) {
    logger.error('Failed to preview booking cancellation', { error: String(err) });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/booking/[id]/cancel
 * Token-verified or staff-authorized cancellation submission.
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    const body = await req.json().catch(() => ({}));
    const parsed = cancelSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
    }

    const staffActor = await resolveStaffSession(req);
    const token = parsed.data.token;

    if (!token && !staffActor) {
      return NextResponse.json(
        { error: 'Unauthorized: cancellation token or authenticated staff session required' },
        { status: 401 }
      );
    }

    await cancelBooking({
      bookingId: id,
      token,
      staffActor: staffActor || undefined,
      reason: parsed.data.reason,
    });

    return NextResponse.json(
      { message: 'Booking successfully cancelled' },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store',
          'Referrer-Policy': 'no-referrer',
        },
      }
    );
  } catch (err: any) {
    if (err instanceof CancellationError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    logger.error('Failed to submit booking cancellation', { error: String(err) });
    return NextResponse.json({ error: err.message || 'Failed to cancel booking' }, { status: 400 });
  }
}
