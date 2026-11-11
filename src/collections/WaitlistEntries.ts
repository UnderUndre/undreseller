import type { CollectionConfig } from 'payload'

import { adminOnly } from '@/access/adminOnly'

/**
 * Smart Waitlist entry (spec 006 rev 1.2, T610): one row per client per
 * service+resource. Slug `waitlist-entries` — antigravity F2 (avoids Next.js
 * route shadowing with the custom `/api/waitlist/*` endpoints). System fields
 * (status/campaign/slot coordinates) are written exclusively by
 * `waitlistService` via raw SQL — field access is closed for API writers.
 */
export const WaitlistEntries: CollectionConfig = {
  slug: 'waitlist-entries',
  access: {
    create: () => false, // written via waitlistService.join (raw SQL)
    delete: adminOnly,
    read: adminOnly,
    update: () => false,
  },
  admin: {
    group: 'Bookings',
    defaultColumns: ['customerName', 'customerPhone', 'serviceId', 'resourceId', 'status', 'campaignCount', 'expiresAt'],
    useAsTitle: 'customerName',
  },
  fields: [
    { name: 'customerName', type: 'text', required: true, maxLength: 200 },
    { name: 'customerPhone', type: 'text', required: true, maxLength: 50 },
    { name: 'customerEmail', type: 'email', required: true },
    { name: 'serviceId', type: 'relationship', relationTo: 'products', required: true },
    { name: 'resourceId', type: 'relationship', relationTo: 'resources', required: true },
    { name: 'expiresAt', type: 'date', required: true },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'pending',
      options: ['pending', 'waiting', 'notified', 'converted', 'expired', 'cancelled'],
      access: { create: () => false, update: () => false },
      admin: { readOnly: true, position: 'sidebar', description: 'pending = double-opt-in not confirmed (spec 007 FR-704) — never enters matching' },
    },
    {
      name: 'campaignCount',
      type: 'number',
      defaultValue: 0,
      access: { create: () => false, update: () => false },
      admin: { readOnly: true, position: 'sidebar', description: 'Campaign cap = 3 (spec 006 audit M1)' },
    },
    {
      name: 'activeCampaignAt',
      type: 'date',
      access: { create: () => false, update: () => false },
      admin: { readOnly: true, position: 'sidebar' },
    },
    {
      name: 'notifiedSlotStart',
      type: 'date',
      access: { create: () => false, update: () => false },
      admin: { readOnly: true, position: 'sidebar', description: 'Slot coordinates bound into the claim HMAC (review F1)' },
    },
    {
      name: 'notifiedSlotEnd',
      type: 'date',
      access: { create: () => false, update: () => false },
      admin: { readOnly: true, position: 'sidebar' },
    },
  ],
  indexes: [
    // Matching: resource+service+status (F13); cap/duplicate checks: phone+status
    { fields: ['resourceId', 'serviceId', 'status'] },
    { fields: ['customerPhone', 'status'] },
  ],
  timestamps: true,
}
