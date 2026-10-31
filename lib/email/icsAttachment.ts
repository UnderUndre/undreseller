/**
 * T031 (FR-605): ICS attachment builder for booking emails.
 * Method switching: PUBLISH on confirmation, CANCEL on cancellation — same
 * stable UID (re-sending never duplicates calendar entries).
 */

import { prisma } from '@/lib/db/prisma';
import { buildIcs, IcsMethod } from '@/lib/integrations/ics';

export async function buildBookingIcsAttachment(
  orderId: string,
  method: IcsMethod
): Promise<{ filename: string; contentBase64: string; contentType: string } | null> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { reservation: { include: { item: true } } },
  });
  if (!order) return null;
  const start = order.reservation?.appointmentStartTime ?? order.reservation?.startTime;
  const end = order.reservation?.appointmentEndTime ?? order.reservation?.endTime;
  if (!start || !end) return null;

  const settings = await prisma.shopSettings.findFirst();
  const timeZone = settings?.timeZone || 'UTC';

  const ics = buildIcs({
    orderId: order.id,
    orderNumber: order.orderNumber,
    serviceTitle: order.reservation?.item?.title ?? 'Booking',
    startsAt: start,
    endsAt: end,
    timeZone,
    method,
  });

  return {
    filename: `booking-${order.orderNumber}.ics`,
    contentBase64: Buffer.from(ics, 'utf8').toString('base64'),
    contentType: 'text/calendar; charset=utf-8; method=' + method,
  };
}
