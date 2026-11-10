import type { CollectionConfig } from 'payload'

import { adminOnly } from '@/access/adminOnly'
import { adminOnlyFieldAccess } from '@/access/adminOnlyFieldAccess'
import { publicAccess } from '@/access/publicAccess'

/** Minimal booking resource (master/room) — spec 002-booking-domain US3, research D7. */
export const Resources: CollectionConfig = {
  slug: 'resources',
  access: {
    create: adminOnly,
    delete: adminOnly,
    read: publicAccess,
    update: adminOnly,
  },
  admin: {
    group: 'Bookings',
    useAsTitle: 'name',
    defaultColumns: ['name', 'active'],
    components: {
      edit: { beforeDocumentControls: ['@/components/admin/CalendarFeedLink#CalendarFeedLink'] },
    },
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    {
      name: 'active',
      type: 'checkbox',
      defaultValue: true,
    },
    {
      name: 'feedTokenVersion',
      type: 'number',
      defaultValue: 1,
      min: 1,
      // Spec 005 review F8: the collection itself is publicly readable
      // (storefront) — the token version must not leak (it IS the credential).
      access: {
        read: adminOnlyFieldAccess,
        update: adminOnlyFieldAccess,
      },
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: 'Versioned calendar-feed token salt — rotate invalidates old URLs (spec 005 FR-504)',
      },
    },
  ],
}

