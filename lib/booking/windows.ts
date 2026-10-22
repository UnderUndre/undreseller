/**
 * Timezone- & Buffer-Aware Appointment Availability (T018)
 * Requirements: FR-307, FR-309, FR-338, INV-004
 * Standards: NIST SP 800-218 SSDF & ISO/IEC/IEEE 12207:2017
 */

import { prisma } from '@/lib/db/prisma';
import { shopConfig } from '@/config/shop.config';

export interface AvailableSlot {
  startsAt: string;          // ISO string (appointment start)
  endsAt: string;            // ISO string (appointment end = startsAt + durationMin)
  occupiedStartsAt: string;  // ISO string (startsAt - effectiveBufferBeforeMin)
  occupiedEndsAt: string;    // ISO string (endsAt + effectiveBufferAfterMin)
  durationMin: number;
  resourceId: string;
}

export interface AvailabilityWindowParams {
  dateStr: string;           // YYYY-MM-DD
  durationMin: number;
  fulfillmentMode: 'IN_CALL' | 'OUT_CALL';
  bufferBeforeMin?: number;
  bufferAfterMin?: number;
  outCallTravelBeforeMin?: number;
  outCallTravelAfterMin?: number;
  slotGridStepMin?: number;
  minNoticeMin?: number;
  timeZone?: string;
  resourceId?: string;
  now?: Date;
}

/**
 * Calculates effective buffers based on fulfillment mode (FR-309, FR-338).
 */
export function calculateEffectiveBuffers(params: {
  fulfillmentMode: 'IN_CALL' | 'OUT_CALL';
  bufferBeforeMin?: number;
  bufferAfterMin?: number;
  outCallTravelBeforeMin?: number;
  outCallTravelAfterMin?: number;
}): { effectiveBufferBeforeMin: number; effectiveBufferAfterMin: number } {
  const baseBefore = Math.max(0, params.bufferBeforeMin || 0);
  const baseAfter = Math.max(0, params.bufferAfterMin || 0);

  if (params.fulfillmentMode === 'OUT_CALL') {
    const travelBefore = Math.max(0, params.outCallTravelBeforeMin || 0);
    const travelAfter = Math.max(0, params.outCallTravelAfterMin || 0);
    return {
      effectiveBufferBeforeMin: baseBefore + travelBefore,
      effectiveBufferAfterMin: baseAfter + travelAfter,
    };
  }

  return {
    effectiveBufferBeforeMin: baseBefore,
    effectiveBufferAfterMin: baseAfter,
  };
}

/**
 * Computes available slots for a resource, taking into account:
 * - Resource weekly hours & availability exceptions (days off / hours overrides)
 * - Service duration & effective buffers (mode-dependent)
 * - Existing BOOKED or active HELD (holdExpiresAt is null or in the future)
 * - GiST exclusion constraint alignment (buffer window)
 */
export async function computeAvailableSlots(
  params: AvailabilityWindowParams
): Promise<AvailableSlot[]> {
  const {
    dateStr,
    durationMin,
    fulfillmentMode,
    bufferBeforeMin = 0,
    bufferAfterMin = 0,
    outCallTravelBeforeMin = 0,
    outCallTravelAfterMin = 0,
    slotGridStepMin = 30,
    minNoticeMin = 60,
    timeZone = 'UTC',
    resourceId = 'default_master',
    now = new Date(),
  } = params;

  if (durationMin <= 0 || durationMin > 480) {
    return [];
  }

  const [year, month, day] = dateStr.split('-').map(Number);
  if (!year || !month || !day) {
    return [];
  }

  const { effectiveBufferBeforeMin, effectiveBufferAfterMin } = calculateEffectiveBuffers({
    fulfillmentMode,
    bufferBeforeMin,
    bufferAfterMin,
    outCallTravelBeforeMin,
    outCallTravelAfterMin,
  });

  // 1. Check for day-off or schedule override in AvailabilityException
  const exception = await prisma.availabilityException.findUnique({
    where: {
      resourceId_date: {
        resourceId,
        date: dateStr,
      },
    },
  });

  if (exception?.isClosed) {
    return []; // Resource is closed on this date
  }

  // 2. Resolve working hours
  const targetDateUtc = new Date(Date.UTC(year, month - 1, day));
  const jsDay = targetDateUtc.getUTCDay();
  const isoWeekday = jsDay === 0 ? 7 : jsDay;

  let startMin: number;
  let endMin: number;
  let breakStartMin: number | null = null;
  let breakEndMin: number | null = null;

  if (exception && exception.startMin != null && exception.endMin != null) {
    startMin = exception.startMin;
    endMin = exception.endMin;
  } else {
    const weeklyHour = await prisma.weeklyHours.findFirst({
      where: {
        resourceId,
        weekday: isoWeekday,
      },
    });

    if (!weeklyHour) {
      return []; // No working hours configured for this weekday
    }

    startMin = weeklyHour.startMin;
    endMin = weeklyHour.endMin;
    breakStartMin = weeklyHour.breakStartMin;
    breakEndMin = weeklyHour.breakEndMin;
  }

  // 3. Query existing overlapping reservations on this resource
  // HELD reservations are active if holdExpiresAt is NULL (pending outcall) or > now
  const dayStart = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  const dayEnd = new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));

  const existingReservations = await prisma.slotReservation.findMany({
    where: {
      resourceId,
      startTime: { lt: dayEnd },
      endTime: { gt: dayStart },
      AND: [
        {
          OR: [
            { status: 'BOOKED' },
            {
              status: 'HELD',
              OR: [{ holdExpiresAt: null }, { holdExpiresAt: { gt: now } }],
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

  const reservationIntervals = existingReservations.map((r) => ({
    startMs: r.startTime.getTime(),
    endMs: r.endTime.getTime(),
  }));

  const minNoticeTimeMs = now.getTime() + minNoticeMin * 60 * 1000;
  const baseDayUtcMs = Date.UTC(year, month - 1, day, 0, 0, 0, 0);

  const slots: AvailableSlot[] = [];

  for (let sMin = startMin; sMin + durationMin <= endMin; sMin += slotGridStepMin) {
    const eMin = sMin + durationMin;

    // Check break window
    if (breakStartMin !== null && breakEndMin !== null) {
      const overlapsBreak = Math.max(sMin, breakStartMin) < Math.min(eMin, breakEndMin);
      if (overlapsBreak) {
        continue;
      }
    }

    const apptStartMs = baseDayUtcMs + sMin * 60 * 1000;
    const apptEndMs = baseDayUtcMs + eMin * 60 * 1000;

    // Minimum notice check
    if (apptStartMs < minNoticeTimeMs) {
      continue;
    }

    // Full occupied window including buffers
    const occupiedStartMs = apptStartMs - effectiveBufferBeforeMin * 60 * 1000;
    const occupiedEndMs = apptEndMs + effectiveBufferAfterMin * 60 * 1000;

    // Conflict check against occupied buffered windows of existing reservations
    let conflict = false;
    for (const r of reservationIntervals) {
      if (Math.max(occupiedStartMs, r.startMs) < Math.min(occupiedEndMs, r.endMs)) {
        conflict = true;
        break;
      }
    }

    if (!conflict) {
      slots.push({
        startsAt: new Date(apptStartMs).toISOString(),
        endsAt: new Date(apptEndMs).toISOString(),
        occupiedStartsAt: new Date(occupiedStartMs).toISOString(),
        occupiedEndsAt: new Date(occupiedEndMs).toISOString(),
        durationMin,
        resourceId,
      });
    }
  }

  return slots;
}
