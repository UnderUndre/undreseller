import { sql } from '@payloadcms/db-postgres'

import type { Payload } from 'payload'

import { computeSlots, type ComputedSlot } from './computeSlots'
import { zonedDateWeekdayISO, zonedToUtc, utcToMinuteOfDay } from './tz'

/** Active statuses that make a slot unavailable. */
export const ACTIVE_STATUSES = ['HELD', 'BOOKED', 'PENDING_APPROVAL'] as const

export interface ResolveAvailabilityInput {
  productId: string
  date: string
  resourceId?: string
  now?: Date
}

export type ResolveAvailabilityResult =
  | {
      ok: true
      resourceId: string
      timeZone: string
      quantumMin: number
      slots: { start: string; end: string }[]
    }
  | { ok: false; code: 'SERVICE_NOT_FOUND' | 'SERVICE_NOT_BOOKABLE' | 'NO_RESOURCE' }

/**
 * DB resolver for the pure availability engine (spec 002-booking-domain US4,
 * research D3): fetches hours/exceptions/busy via Payload Local API + raw SQL,
 * feeds `computeSlots`, converts results back to UTC instants.
 */
export async function resolveAvailability(
  payload: Payload,
  input: ResolveAvailabilityInput,
): Promise<ResolveAvailabilityResult> {
  let product: Record<string, unknown> | null = null
  try {
    product = (await payload.findByID({
      collection: 'products',
      id: input.productId,
      overrideAccess: true,
      depth: 0,
    })) as unknown as Record<string, unknown> | null
  } catch {
    product = null
  }
  if (!product || (product as { deletedAt?: string | null }).deletedAt) {
    return { ok: false, code: 'SERVICE_NOT_FOUND' }
  }
  if (product.bookable !== true || typeof product.durationMin !== 'number') {
    return { ok: false, code: 'SERVICE_NOT_BOOKABLE' }
  }

  const settings = (await payload.findGlobal({
    slug: 'shop-settings',
    overrideAccess: true,
    depth: 0,
  })) as { timeZone?: string; quantumMin?: number } | null
  const timeZone = settings?.timeZone || 'UTC'
  const quantumMin = settings?.quantumMin ?? 30

  let resourceId: string | number | undefined = input.resourceId
  if (!resourceId) {
    const active = await payload.find({
      collection: 'resources',
      where: { active: { equals: true } },
      limit: 1,
      overrideAccess: true,
      depth: 0,
    })
    resourceId = active.docs[0]?.id
  }
  if (!resourceId) return { ok: false, code: 'NO_RESOURCE' }

  const weekday = zonedDateWeekdayISO(input.date)
  const weeklyHours = (
    await payload.find({
      collection: 'weekly-hours',
      where: { and: [{ resourceId: { equals: resourceId } }, { weekday: { equals: weekday } }] },
      limit: 24,
      overrideAccess: true,
      depth: 0,
    })
  ).docs as unknown as {
    startMin: number
    endMin: number
    breakStartMin: number | null
    breakEndMin: number | null
  }[]

  const exceptions = (
    await payload.find({
      collection: 'availability-exceptions',
      where: { and: [{ resourceId: { equals: resourceId } }, { date: { equals: input.date } }] },
      limit: 24,
      overrideAccess: true,
      depth: 0,
    })
  ).docs as unknown as { date: string; isClosed: boolean; startMin: number | null; endMin: number | null }[]

  // Busy: active reservations of the resource touching the queried day,
  // expanded by THEIR buffers, converted to minute-space of this date.
  const busyRows = await payload.db.execute({
    drizzle: (payload.db as unknown as { drizzle: any }).drizzle,
    sql: sql`SELECT start_time, end_time, buffer_before_min, buffer_after_min
             FROM slot_reservations
             WHERE resource_id = ${resourceId}
               AND status IN ('HELD', 'BOOKED', 'PENDING_APPROVAL')`,
  })
  const busy = (busyRows.rows as { start_time: string; end_time: string; buffer_before_min: number; buffer_after_min: number }[])
    .map((r) => {
      const start = new Date(r.start_time)
      const end = new Date(r.end_time)
      return {
        startMin: utcToMinuteOfDay(input.date, start, timeZone) - Number(r.buffer_before_min ?? 0),
        endMin: utcToMinuteOfDay(input.date, end, timeZone) + Number(r.buffer_after_min ?? 0),
      }
    })
    .map((b) => ({ startMin: Math.max(0, b.startMin), endMin: Math.min(1440, b.endMin) }))
    .filter((b) => b.endMin > b.startMin)

  const now = input.now ?? new Date()
  const nowMin = utcToMinuteOfDay(input.date, now, timeZone)

  const computed: ComputedSlot[] = computeSlots({
    date: input.date,
    weekday,
    service: {
      durationMin: product.durationMin as number,
      bufferBeforeMin: (product.bufferBeforeMin as number) ?? 0,
      bufferAfterMin: (product.bufferAfterMin as number) ?? 0,
    },
    weeklyHours: weeklyHours.map((w) => ({
      weekday,
      startMin: w.startMin,
      endMin: w.endMin,
      breakStartMin: w.breakStartMin,
      breakEndMin: w.breakEndMin,
    })),
    exceptions,
    busy,
    quantumMin,
    nowMin: nowMin >= 0 && nowMin <= 1440 ? nowMin : undefined,
  })

  return {
    ok: true,
    resourceId: String(resourceId),
    timeZone,
    quantumMin,
    slots: computed.map((s) => ({
      start: zonedToUtc(input.date, s.startMin, timeZone).toISOString(),
      end: zonedToUtc(input.date, s.endMin, timeZone).toISOString(),
    })),
  }
}
