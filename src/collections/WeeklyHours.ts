import type { CollectionConfig } from 'payload'

import { adminOnly } from '@/access/adminOnly'
import { publicAccess } from '@/access/publicAccess'

/** Pure validator: endMin after startMin (reused by tests — error-shapes canon). */
export function validateEndAfterStart(
  value: unknown,
  { data }: { data?: { startMin?: unknown } | null }
): true | string {
  const start = data?.startMin
  if (typeof value !== 'number' || typeof start !== 'number') return true
  return value > start || 'endMin must be after startMin'
}

/** Working hours per weekday per resource (spec 002-booking-domain US3; legacy WeeklyHours design). */
export const WeeklyHours: CollectionConfig = {
  slug: 'weekly-hours',
  access: {
    create: adminOnly,
    delete: adminOnly,
    read: publicAccess,
    update: adminOnly,
  },
  admin: {
    group: 'Bookings',
    defaultColumns: ['resourceId', 'weekday', 'startMin', 'endMin'],
  },
  fields: [
    {
      name: 'resourceId',
      type: 'relationship',
      relationTo: 'resources',
      required: true,
    },
    {
      name: 'weekday',
      type: 'number',
      required: true,
      min: 1,
      max: 7,
      admin: { description: 'ISO weekday: 1 = Monday … 7 = Sunday' },
    },
    {
      name: 'startMin',
      type: 'number',
      required: true,
      min: 0,
      max: 1440,
      admin: { description: 'Minutes from midnight in ShopSettings.timeZone' },
    },
    {
      name: 'endMin',
      type: 'number',
      required: true,
      min: 0,
      max: 1440,
      validate: validateEndAfterStart,
    },
    {
      name: 'breakStartMin',
      type: 'number',
      min: 0,
      max: 1440,
    },
    {
      name: 'breakEndMin',
      type: 'number',
      min: 0,
      max: 1440,
      validate: (value: unknown, options: { data?: Record<string, unknown> | null }) => {
        const start = options.data?.breakStartMin
        if (typeof value !== 'number' || typeof start !== 'number') return true
        return value > start || 'breakEndMin must be after breakStartMin'
      },
    },
  ],
  timestamps: false,
}
