import type { CollectionConfig } from 'payload'

import { adminOnly } from '@/access/adminOnly'

/**
 * BookingIntent (spec 007 FR-701, research D1): a pre-booking email-verification
 * record — NOT a booking. It holds no slot (no GiST entry, no FSM state) and is
 * written exclusively by `intentService` via raw SQL. The intent is the unit of
 * the trust gate: slot inventory is captured by the FSM only after OTP
 * verification. Status machine: pending → consumed | dead | expired (only the
 * sweep and the service CAS-transition writers).
 */
export const BookingIntents: CollectionConfig = {
  slug: 'booking-intents',
  access: {
    create: () => false, // written via intentService (raw SQL)
    delete: adminOnly,
    read: adminOnly,
    update: () => false,
  },
  admin: {
    group: 'Bookings',
    defaultColumns: ['email', 'customerName', 'status', 'expiresAt', 'attempts'],
    useAsTitle: 'email',
  },
  fields: [
    { name: 'email', type: 'email', required: true },
    { name: 'customerName', type: 'text', required: true, maxLength: 200 },
    { name: 'customerPhone', type: 'text', required: true, maxLength: 50 },
    { name: 'serviceId', type: 'relationship', relationTo: 'products', required: true },
    { name: 'resourceId', type: 'relationship', relationTo: 'resources', required: true },
    {
      name: 'slotStart',
      type: 'date',
      required: true,
      admin: { description: 'Slot coordinates — phase 2 hydrates from HERE, never from the request body (review F5)' },
    },
    { name: 'slotEnd', type: 'date', required: true },
    {
      name: 'codeHash',
      type: 'text',
      required: true,
      access: { create: () => false, update: () => false },
      admin: { readOnly: true, position: 'sidebar', description: 'HMAC(code | intentId | email) — plaintext code is never persisted (audit C1)' },
    },
    { name: 'expiresAt', type: 'date', required: true },
    {
      name: 'attempts',
      type: 'number',
      defaultValue: 0,
      access: { create: () => false, update: () => false },
      admin: { readOnly: true, position: 'sidebar', description: 'Wrong-code counter; >= 5 → dead (SC-001)' },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'pending',
      options: ['pending', 'consumed', 'dead', 'expired'],
      access: { create: () => false, update: () => false },
      admin: { readOnly: true, position: 'sidebar' },
    },
  ],
  indexes: [
    // Live-cap check per email (FR-701) — composite with status.
    { fields: ['email', 'status'] },
    // Sweep: pending + expiresAt < now (F10); retention purge (F7).
    { fields: ['status', 'expiresAt'] },
  ],
  timestamps: true,
}
