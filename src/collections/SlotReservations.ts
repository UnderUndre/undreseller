import type { CollectionConfig } from 'payload'

import { adminOnly } from '@/access/adminOnly'
import { RESERVATION_STATUS_OPTIONS } from '@/lib/kernel/reservationStatus'

/**
 * Booking skeleton collection (spec 001-reinit US5b, FR-106; research D3).
 *
 * Security posture (antigravity F3/F4):
 * - Fail-closed access: OWNER-only CRUD (`adminOnly`). No anonymous REST/GraphQL
 *   surface until the public booking API lands in 002.
 * - `status` is `admin: { readOnly: true }` — FSM transitions happen exclusively
 *   through the domain service (002+), never through a hand-picked admin dropdown.
 *
 * Double-booking defense (GiST EXCLUDE + advisory locks) is a PG-level 002 task —
 * the legacy design survives any ORM (business plan v2.5.0 §2.5).
 */

/** Pure field validator: endTime must be strictly after startTime. */
export function validateEndTimeAfterStart(
  value: unknown,
  { data }: { data?: { startTime?: unknown } | null }
): true | string {
  const start = data?.startTime
  if (!value || !start) return true
  const endMs = new Date(value as string | number | Date).getTime()
  const startMs = new Date(start as string | number | Date).getTime()
  if (Number.isNaN(endMs) || Number.isNaN(startMs)) return true
  return endMs > startMs || 'endTime must be after startTime'
}

/** Pure field validator: scheduleVersion is a CAS guard and must be >= 1. */
export function validateScheduleVersion(value: unknown): true | string {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 1) return true
  return 'scheduleVersion must be an integer >= 1'
}

export const SlotReservations: CollectionConfig = {
  slug: 'slot-reservations',
  access: {
    create: adminOnly,
    delete: adminOnly,
    read: adminOnly,
    update: adminOnly,
  },
  admin: {
    group: 'Bookings',
    defaultColumns: ['order', 'resourceId', 'startTime', 'endTime', 'status', 'scheduleVersion'],
    useAsTitle: 'id',
  },
  fields: [
    {
      name: 'order',
      type: 'relationship',
      relationTo: 'orders',
      admin: { description: 'Linked order (nullable until the booking FSM wiring lands in 002).' },
    },
    {
      name: 'resourceId',
      type: 'text',
      admin: { description: 'Booking resource (master/room) — resource model arrives in 002.' },
    },
    {
      name: 'itemId',
      type: 'text',
      admin: { description: 'Optional service/item reference (legacy SlotReservation parity).' },
    },
    {
      name: 'startTime',
      type: 'date',
      required: true,
    },
    {
      name: 'endTime',
      type: 'date',
      required: true,
      validate: validateEndTimeAfterStart,
    },
    {
      name: 'totalDurationMin',
      type: 'number',
      required: true,
      min: 1,
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'HELD',
      // Options come from the kernel const (single source of truth, zcode F3 guard):
      // the collection enum can never drift from the FSM↔DB mapping.
      options: RESERVATION_STATUS_OPTIONS,
      // Airtight F4/SEC-2 (fix-review 2026-11-07): readOnly hides the field in the
      // admin UI, but REST/GraphQL still accepts it — block client writes at the
      // field level entirely. The 002+ domain service writes through the Local API
      // (overrideAccess: true), which bypasses field access.
      access: {
        create: () => false,
        update: () => false,
      },
      admin: {
        readOnly: true,
        description:
          'FSM-controlled (bookingFsm kernel). Manual changes disabled — transitions only via the domain service (002+).',
      },
    },
    {
      name: 'scheduleVersion',
      type: 'number',
      required: true,
      defaultValue: 1,
      validate: validateScheduleVersion,
      admin: { description: 'CAS guard for staff actions / reminders (legacy canon).' },
    },
    {
      name: 'holdExpiresAt',
      type: 'date',
    },
    {
      name: 'holdFrozenAt',
      type: 'date',
    },
    {
      name: 'bufferBeforeMin',
      type: 'number',
      defaultValue: 0,
      min: 0,
    },
    {
      name: 'bufferAfterMin',
      type: 'number',
      defaultValue: 0,
      min: 0,
    },
    {
      name: 'customerName',
      type: 'text',
      required: true,
      maxLength: 200,
    },
    {
      name: 'customerPhone',
      type: 'text',
      required: true,
      maxLength: 50,
    },
    {
      name: 'idempotencyKey',
      type: 'text',
      unique: true,
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: 'Client-supplied idempotency key (spec 002 FR-206); unique per booking',
      },
    },
    {
      name: 'cancelTokenHash',
      type: 'text',
      admin: {
        position: 'sidebar',
        readOnly: true,
        condition: () => false,
        description: 'sha256 of the one-time customer cancel token — never exposed',
      },
    },
    {
      name: 'rescheduleTokenHash',
      type: 'text',
      admin: {
        position: 'sidebar',
        readOnly: true,
        condition: () => false,
        description: 'HMAC digest of the one-time reschedule nonce (spec 003 FR-306); consumed on use',
      },
    },
    {
      name: 'reminderSentAt',
      type: 'date',
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: 'CAS claim of the reminder sweep (spec 003 US3) — exactly-once send',
      },
    },
  ],
  timestamps: true,
}
