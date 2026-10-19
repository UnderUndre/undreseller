import { prisma } from '@/lib/db/prisma';
import { shopConfig } from '@/config/shop.config';

export interface AvailableSlot {
  startTime: string; // ISO string
  endTime: string;   // ISO string
}

export async function getAvailableSlots(itemId: string, dateStr: string): Promise<AvailableSlot[]> {
  const item = await prisma.item.findUnique({
    where: { id: itemId },
    select: {
      id: true,
      itemType: true,
      durationMin: true,
      isActive: true,
    },
  });

  if (!item || !item.isActive || item.itemType !== 'SERVICE' || !item.durationMin) {
    return [];
  }

  // Parse target date YYYY-MM-DD
  const [year, month, day] = dateStr.split('-').map(Number);
  if (!year || !month || !day) {
    return [];
  }

  // Determine weekday in ISO 1-7 (1 = Monday, 7 = Sunday)
  const targetDate = new Date(Date.UTC(year, month - 1, day));
  const jsDay = targetDate.getUTCDay(); // 0 is Sunday
  const isoWeekday = jsDay === 0 ? 7 : jsDay;

  // Fetch working hours
  const hours = await prisma.weeklyHours.findFirst({
    where: {
      OR: [{ itemId: item.id, weekday: isoWeekday }, { itemId: null, weekday: isoWeekday }],
    },
    orderBy: { itemId: 'desc' }, // specific item hours take priority over global
  });

  if (!hours) {
    return [];
  }

  const durationMin = item.durationMin;
  const now = new Date();
  const minNoticeTime = new Date(now.getTime() + shopConfig.minNoticeMin * 60 * 1000);

  // Candidate slots in minutes from midnight
  const candidateSlots: Array<{ start: Date; end: Date }> = [];
  for (let min = hours.startMin; min + durationMin <= hours.endMin; min += durationMin) {
    // Check if slot overlaps with lunch break
    if (hours.breakStartMin !== null && hours.breakEndMin !== null) {
      const slotEndMin = min + durationMin;
      const overlapsBreak = Math.max(min, hours.breakStartMin) < Math.min(slotEndMin, hours.breakEndMin);
      if (overlapsBreak) {
        continue;
      }
    }

    const slotStart = new Date(Date.UTC(year, month - 1, day, Math.floor(min / 60), min % 60, 0));
    const slotEnd = new Date(slotStart.getTime() + durationMin * 60 * 1000);

    // Filter out slots that violate minimum notice time
    if (slotStart.getTime() < minNoticeTime.getTime()) {
      continue;
    }

    candidateSlots.push({ start: slotStart, end: slotEnd });
  }

  if (candidateSlots.length === 0) {
    return [];
  }

  // Fetch active reservations for this date
  const dayStart = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  const dayEnd = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));

  const existingReservations = await prisma.slotReservation.findMany({
    where: {
      itemId: item.id,
      startTime: { gte: dayStart },
      endTime: { lte: dayEnd },
      OR: [
        { status: 'BOOKED' },
        {
          status: 'HELD',
          holdExpiresAt: { gt: now },
        },
      ],
    },
    select: {
      startTime: true,
      endTime: true,
    },
  });

  // Filter out any slot overlapping with an active reservation
  const available = candidateSlots.filter((slot) => {
    const slotStartTime = slot.start.getTime();
    const slotEndTime = slot.end.getTime();

    for (const res of existingReservations) {
      const resStartTime = res.startTime.getTime();
      const resEndTime = res.endTime.getTime();

      const overlaps = Math.max(slotStartTime, resStartTime) < Math.min(slotEndTime, resEndTime);
      if (overlaps) {
        return false;
      }
    }
    return true;
  });

  return available.map((s) => ({
    startTime: s.start.toISOString(),
    endTime: s.end.toISOString(),
  }));
}
