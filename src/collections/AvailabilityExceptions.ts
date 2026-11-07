import type { CollectionConfig } from 'payload'

import { adminOnly } from '@/access/adminOnly'
import { publicAccess } from '@/access/publicAccess'

/** Pure validator: YYYY-MM-DD. */
export function validateISODate(value: unknown): true | string {
  return (
    (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) ||
    'date must be in YYYY-MM-DD format'
  )
}

/** Day-level availability exceptions: closed days or partial-day windows (spec 002 US3). */
export const AvailabilityExceptions: CollectionConfig = {
  slug: 'availability-exceptions',
  access: {
    create: adminOnly,
    delete: adminOnly,
    read: publicAccess,
    update: adminOnly,
  },
  admin: {
    group: 'Bookings',
    defaultColumns: ['resourceId', 'date', 'isClosed'],
  },
  fields: [
    {
      name: 'resourceId',
      type: 'relationship',
      relationTo: 'resources',
      required: true,
    },
    {
      name: 'date',
      type: 'text',
      required: true,
      validate: validateISODate,
      admin: { description: 'YYYY-MM-DD in ShopSettings.timeZone' },
    },
    {
      name: 'isClosed',
      type: 'checkbox',
      defaultValue: true,
    },
    {
      name: 'startMin',
      type: 'number',
      min: 0,
      max: 1440,
      admin: {
        condition: ({ siblingData }) => siblingData?.isClosed === false,
        description: 'Partial-day window start (when not fully closed)',
      },
    },
    {
      name: 'endMin',
      type: 'number',
      min: 0,
      max: 1440,
      validate: (value: unknown, options: { data?: Record<string, unknown> | null }) => {
        if (options.data?.isClosed) return true
        const start = options.data?.startMin
        if (typeof value !== 'number' || typeof start !== 'number') return true
        return value > start || 'endMin must be after startMin'
      },
      admin: {
        condition: ({ siblingData }) => siblingData?.isClosed === false,
      },
    },
  ],
  indexes: [{ fields: ['resourceId', 'date'] }],
  timestamps: false,
}
