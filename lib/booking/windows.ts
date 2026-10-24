/**
 * Timezone- & Buffer-Aware Appointment Availability (T018)
 * Requirements: FR-307, FR-309, FR-338, INV-004
 * Standards: NIST SP 800-218 SSDF & ISO/IEC/IEEE 12207:2017
 */

import { fromZonedTime, toZonedTime } from 'date-fns-tz';
import { prisma } from '@/lib/db/prisma';

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

  // T030: business-local date string (YYYY-MM-DD) reused across tz conversions
  const dateIso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

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
  // Weekday of the business-local calendar date (noon is DST-stable)
  const localNoon = toZonedTime(fromZonedTime(`${dateIso}T12:00:00`, timeZone), timeZone);
  const jsDay = localNoon.getDay();
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
  // T030: resolve the business-local day boundaries as UTC instants (IANA/DST-correct)
  const dayStart = fromZonedTime(`${dateIso}T00:00:00`, timeZone);
  const dayEnd = fromZonedTime(`${dateIso}T23:59:59.999`, timeZone);

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

  return await computeSlotsInternal(params, {
    durationMin,
    dateIso,
    startMin,
    endMin,
    breakStartMin,
    breakEndMin,
    timeZone,
    reservationIntervals,
  }).then((r) => r.slots);
}

/** Blocked-candidate explanation (T031, FR-408). */
export type UnavailableReason = 'booked' | 'break';

export interface UnavailableSlot {
  startsAt: string;
  endsAt: string;
  reason: UnavailableReason;
}

export interface SlotsWithReasons {
  slots: AvailableSlot[];
  unavailable: UnavailableSlot[];
}

interface InternalWindowContext {
  durationMin: number;
  dateIso: string;
  startMin: number;
  endMin: number;
  breakStartMin: number | null;
  breakEndMin: number | null;
  timeZone: string;
  reservationIntervals: Array<{ startMs: number; endMs: number }>;
}

/** T031: same computation, but blocked grid candidates are reported with a reason (booked|break). */
export async function computeSlotsWithReasons(
  params: AvailabilityWindowParams
): Promise<SlotsWithReasons> {
  const {
    dateStr,
    durationMin,
    fulfillmentMode,
    bufferBeforeMin = 0,
    bufferAfterMin = 0,
    outCallTravelBeforeMin = 0,
    outCallTravelAfterMin = 0,
    slotGridStepMin = 30,
    timeZone = 'UTC',
    resourceId = 'default_master',
    now = new Date(),
  } = params;

  if (durationMin <= 0 || durationMin > 480) {
    return { slots: [], unavailable: [] };
  }

  const [year, month, day] = dateStr.split('-').map(Number);
  if (!year || !month || !day) {
    return { slots: [], unavailable: [] };
  }
  const dateIso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  const exception = await prisma.availabilityException.findUnique({
    where: { resourceId_date: { resourceId, date: dateStr } },
  });
  if (exception?.isClosed) {
    return { slots: [], unavailable: [] };
  }

  const localNoon = toZonedTime(fromZonedTime(`${dateIso}T12:00:00`, timeZone), timeZone);
  const jsDay = localNoon.getDay();
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
      where: { resourceId, weekday: isoWeekday },
    });
    if (!weeklyHour) {
      return { slots: [], unavailable: [] };
    }
    startMin = weeklyHour.startMin;
    endMin = weeklyHour.endMin;
    breakStartMin = weeklyHour.breakStartMin;
    breakEndMin = weeklyHour.breakEndMin;
  }

  const dayStart = fromZonedTime(`${dateIso}T00:00:00`, timeZone);
  const dayEnd = fromZonedTime(`${dateIso}T23:59:59.999`, timeZone);

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
    select: { startTime: true, endTime: true },
  });

  const reservationIntervals = existingReservations.map((r) => ({
    startMs: r.startTime.getTime(),
    endMs: r.endTime.getTime(),
  }));

  return await computeSlotsInternal(params, {
    durationMin,
    dateIso,
    startMin,
    endMin,
    breakStartMin,
    breakEndMin,
    timeZone,
    reservationIntervals,
  });
}

async function computeSlotsInternal(
  params: AvailabilityWindowParams,
  ctx: InternalWindowContext
): Promise<SlotsWithReasons> {
  const {
    bufferBeforeMin = 0,
    bufferAfterMin = 0,
    outCallTravelBeforeMin = 0,
    outCallTravelAfterMin = 0,
    fulfillmentMode,
    slotGridStepMin = 30,
    minNoticeMin = 60,
    resourceId = 'default_master',
    now = new Date(),
  } = params;
  const { durationMin, dateIso, timeZone, reservationIntervals } = ctx;

  const { effectiveBufferBeforeMin, effectiveBufferAfterMin } = calculateEffectiveBuffers({
    fulfillmentMode,
    bufferBeforeMin,
    bufferAfterMin,
    outCallTravelBeforeMin,
    outCallTravelAfterMin,
  });

  const minNoticeTimeMs = now.getTime() + minNoticeMin * 60 * 1000;

  const slots: AvailableSlot[] = [];
  const unavailable: UnavailableSlot[] = [];

  for (let sMin = ctx.startMin; sMin + durationMin <= ctx.endMin; sMin += slotGridStepMin) {
    const eMin = sMin + durationMin;

    // Check break window
    if (ctx.breakStartMin !== null && ctx.breakEndMin !== null) {
      const overlapsBreak =
        Math.max(sMin, ctx.breakStartMin) < Math.min(eMin, ctx.breakEndMin);
      if (overlapsBreak) {
        const bStartMs = fromZonedTime(
          `${ctx.dateIso}T${String(Math.floor(sMin / 60)).padStart(2, '0')}:${String(sMin % 60).padStart(2, '0')}:00`,
          timeZone
        ).getTime();
        const bEndMs = fromZonedTime(
          `${ctx.dateIso}T${String(Math.floor(eMin / 60)).padStart(2, '0')}:${String(eMin % 60).padStart(2, '0')}:00`,
          timeZone
        ).getTime();
        unavailable.push({
          startsAt: new Date(bStartMs).toISOString(),
          endsAt: new Date(bEndMs).toISOString(),
          reason: 'break',
        });
        continue;
      }
    }

    // Convert business-local wall-clock time to the correct UTC instant;
    // during DST transitions non-existent wall times shift forward (fromZonedTime).
    const apptStartMs = fromZonedTime(
      `${dateIso}T${String(Math.floor(sMin / 60)).padStart(2, '0')}:${String(sMin % 60).padStart(2, '0')}:00`,
      timeZone
    ).getTime();
    const apptEndMs = fromZonedTime(
      `${dateIso}T${String(Math.floor(eMin / 60)).padStart(2, '0')}:${String(eMin % 60).padStart(2, '0')}:00`,
      timeZone
    ).getTime();

    // Minimum notice check (too-soon candidates are silently skipped, not explained)
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

    if (conflict) {
      unavailable.push({
        startsAt: new Date(apptStartMs).toISOString(),
        endsAt: new Date(apptEndMs).toISOString(),
        reason: 'booked',
      });
    } else {
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

  return { slots, unavailable };
}
