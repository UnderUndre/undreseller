import { prisma } from '@/lib/db/prisma';
import { shopConfig } from '@/config/shop.config';
import { validateAndBuildServiceCart, AuthoritativeServiceItem } from './cart';

export interface AvailableSlot {
  startTime: string; // ISO string
  endTime: string;   // ISO string
  totalDurationMin?: number;
  resourceId?: string;
}

export interface ContiguousWindowInput {
  dateStr: string;
  totalDurationMin: number;
  slotGridStepMin?: number;
  minNoticeMin?: number;
  now?: Date;
  resourceId?: string;
  workingHours: {
    startMin: number;
    endMin: number;
    breakStartMin: number | null;
    breakEndMin: number | null;
  };
  existingReservations: Array<{
    startTime: Date;
    endTime: Date;
  }>;
}

export function computeContiguousAvailableSlots(input: ContiguousWindowInput): AvailableSlot[] {
  const {
    dateStr,
    totalDurationMin,
    slotGridStepMin = 30,
    minNoticeMin = shopConfig.minNoticeMin,
    now = new Date(),
    resourceId = 'default_master',
    workingHours,
    existingReservations,
  } = input;

  if (totalDurationMin <= 0 || totalDurationMin > 480 || slotGridStepMin <= 0) {
    return [];
  }

  const [year, month, day] = dateStr.split('-').map(Number);
  if (!year || !month || !day) {
    return [];
  }

  const minNoticeTimeMs = now.getTime() + minNoticeMin * 60 * 1000;
  const reservationRanges = existingReservations.map((r) => ({
    startMs: r.startTime.getTime(),
    endMs: r.endTime.getTime(),
  }));

  const available: AvailableSlot[] = [];
  const baseDayUtcMs = Date.UTC(year, month - 1, day, 0, 0, 0, 0);

  for (
    let startMin = workingHours.startMin;
    startMin + totalDurationMin <= workingHours.endMin;
    startMin += slotGridStepMin
  ) {
    const endMin = startMin + totalDurationMin;

    // 1. Check break overlap
    if (workingHours.breakStartMin !== null && workingHours.breakEndMin !== null) {
      const overlapsBreak =
        Math.max(startMin, workingHours.breakStartMin) < Math.min(endMin, workingHours.breakEndMin);
      if (overlapsBreak) {
        continue;
      }
    }

    const slotStartMs = baseDayUtcMs + startMin * 60 * 1000;
    const slotEndMs = baseDayUtcMs + endMin * 60 * 1000;

    // 2. Check minimum notice window
    if (slotStartMs < minNoticeTimeMs) {
      continue;
    }

    // 3. Check overlap with any existing HELD/BOOKED reservation on the resource
    let hasConflict = false;
    for (let i = 0; i < reservationRanges.length; i++) {
      const res = reservationRanges[i];
      if (Math.max(slotStartMs, res.startMs) < Math.min(slotEndMs, res.endMs)) {
        hasConflict = true;
        break;
      }
    }

    if (!hasConflict) {
      available.push({
        startTime: new Date(slotStartMs).toISOString(),
        endTime: new Date(slotEndMs).toISOString(),
        totalDurationMin,
        resourceId,
      });
    }
  }

  return available;
}

export async function getAvailableSlots(
  itemIdsInput: string | string[],
  dateStr: string,
  options?: {
    resourceId?: string;
    slotGridStepMin?: number;
    now?: Date;
  }
): Promise<AvailableSlot[]> {
  const itemIds = Array.isArray(itemIdsInput)
    ? itemIdsInput
    : String(itemIdsInput)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

  if (itemIds.length === 0) {
    return [];
  }

  const [year, month, day] = dateStr.split('-').map(Number);
  if (!year || !month || !day) {
    return [];
  }

  const items = await prisma.item.findMany({
    where: { id: { in: itemIds } },
    select: {
      id: true,
      title: true,
      priceMinor: true,
      starsPrice: true,
      currency: true,
      itemType: true,
      durationMin: true,
      isActive: true,
    },
  });

  let validatedCart;
  try {
    validatedCart = validateAndBuildServiceCart(itemIds, items as AuthoritativeServiceItem[]);
  } catch {
    return [];
  }

  const targetDate = new Date(Date.UTC(year, month - 1, day));
  const jsDay = targetDate.getUTCDay();
  const isoWeekday = jsDay === 0 ? 7 : jsDay;
  const resourceId = options?.resourceId || 'default_master';

  // Fetch working hours (prefer item-specific for primary service, fallback to global)
  const hours = await prisma.weeklyHours.findFirst({
    where: {
      OR: [
        { itemId: { in: validatedCart.itemIds }, weekday: isoWeekday },
        { itemId: null, weekday: isoWeekday },
      ],
    },
    orderBy: { itemId: 'desc' },
  });

  if (!hours) {
    return [];
  }

  let slotGridStepMin = options?.slotGridStepMin;
  if (!slotGridStepMin) {
    const settings = await prisma.shopSettings.findUnique({
      where: { id: 1 },
      select: { slotGridStepMin: true },
    });
    slotGridStepMin = settings?.slotGridStepMin || 30;
  }

  const now = options?.now || new Date();
  const dayStart = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  const dayEnd = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));

  // Query active reservations by resourceId (plus legacy itemId fallback during Expand/Cutover)
  const existingReservations = await prisma.slotReservation.findMany({
    where: {
      OR: [{ resourceId }, { itemId: { in: validatedCart.itemIds } }],
      startTime: { lt: dayEnd },
      endTime: { gt: dayStart },
      AND: [
        {
          OR: [
            { status: 'BOOKED' },
            {
              status: 'HELD',
              holdExpiresAt: { gt: now },
            },
          ],
        },
      ],
    },
    select: {
      startTime: true,
      endTime: true,
    },
  });

  return computeContiguousAvailableSlots({
    dateStr,
    totalDurationMin: validatedCart.totalDurationMin,
    slotGridStepMin,
    now,
    resourceId,
    workingHours: {
      startMin: hours.startMin,
      endMin: hours.endMin,
      breakStartMin: hours.breakStartMin,
      breakEndMin: hours.breakEndMin,
    },
    existingReservations,
  });
}
