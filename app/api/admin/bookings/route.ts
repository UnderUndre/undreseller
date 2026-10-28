import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { authenticateStaff } from '@/lib/security/staffAuth';
import { getAnswersForBookings } from '@/lib/kernel/customFieldService';
import { logger } from '@/lib/telemetry/logger';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await authenticateStaff(req, 'PERFORMER');
  if (!auth.authenticated) return auth.errorResponse!;

  try {
    const actor = auth.actor!;
    const isPerformerOnly = actor.actorRole === 'PERFORMER';

    // Role-filtered query (FR-326)
    const reservations = await prisma.slotReservation.findMany({
      where: isPerformerOnly
        ? { resourceId: actor.resourceId || actor.actorId }
        : {},
      include: {
        item: true,
        order: true,
      },
      orderBy: { startTime: 'desc' },
      take: 100,
    });

    const bookings = reservations.map((r) => {
      const apptStart = r.appointmentStartTime || r.startTime;
      const apptEnd = r.appointmentEndTime || r.endTime;

      let status = 'PENDING';
      if (r.status === 'BOOKED') status = 'CONFIRMED';
      else if (r.status === 'RELEASED') status = 'CANCELLED';
      else if (r.order.status === 'FULFILLED') status = 'COMPLETED';

      return {
        bookingId: r.id,
        orderId: r.orderId,
        orderNumber: r.order.orderNumber,
        serviceTitle: r.item?.title || 'Appointment',
        resourceId: r.resourceId,
        startsAt: apptStart.toISOString(),
        endsAt: apptEnd.toISOString(),
        occupiedStartsAt: r.startTime.toISOString(),
        occupiedEndsAt: r.endTime.toISOString(),
        status,
        confirmationStatus: r.order.confirmationStatus,
        customerName: r.order.customerName || 'Anonymous',
        // Customer contact provided to managing staff (INV-010)
        customerContact: r.order.customerPhone || r.order.customerEmail || 'N/A',
        fulfillmentMode: r.fulfillmentMode,
        serviceAddress: r.serviceAddressSnapshot,
        servicePriceMinor: r.servicePriceMinor,
        travelFeeMinor: r.travelFeeMinor,
        totalMinor: r.order.totalMinor,
        currency: r.order.currency,
        requiresOperatorAction: r.requiresOperatorAction,
      };
    });

    // US6 (FR-424): sanitized custom-field answers travel with each booking
    // (staff/authorized roles only — this route is authenticateStaff-gated).
    const answersByBooking = await getAnswersForBookings(reservations.map((r) => r.id));
    const bookingsWithAnswers = bookings.map((b) => ({
      ...b,
      fieldAnswers: answersByBooking[b.bookingId] ?? [],
    }));

    return NextResponse.json({ bookings: bookingsWithAnswers }, { status: 200 });
  } catch (err: unknown) {
    logger.error('Failed to list staff bookings', { error: String(err) });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
