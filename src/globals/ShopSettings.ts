import type { GlobalConfig } from 'payload'

import { adminOnly } from '@/access/adminOnly'
import { publicAccess } from '@/access/publicAccess'

/**
 * Instance-level shop settings (spec 002-booking-domain US3, research D3):
 * timeZone drives ALL slot computation (fixed-offset, legacy "inert timezone"
 * lesson); quantumMin is the slot grid step.
 */
export const ShopSettings: GlobalConfig = {
  slug: 'shop-settings',
  access: {
    read: publicAccess,
    update: adminOnly,
  },
  fields: [
    {
      name: 'timeZone',
      type: 'text',
      defaultValue: 'UTC',
      admin: { description: 'IANA timezone for slot computation (e.g. Asia/Yerevan)' },
    },
    {
      name: 'quantumMin',
      type: 'number',
      defaultValue: 30,
      min: 5,
      max: 240,
      admin: { description: 'Slot grid step in minutes' },
    },
  ],
}
