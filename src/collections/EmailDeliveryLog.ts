import type { CollectionConfig } from 'payload'

import { adminOnly } from '@/access/adminOnly'

/**
 * Email delivery log (spec 003 FR-305, PII canon INV-010): one row per send
 * attempt. The recipient is stored as a salted hash, never as a raw address.
 */
export const EmailDeliveryLog: CollectionConfig = {
  slug: 'email-delivery-log',
  access: {
    create: () => false, // written by the email jobs via Local API/raw SQL
    delete: () => false,
    read: adminOnly,
    update: () => false,
  },
  admin: {
    group: 'Bookings',
    defaultColumns: ['kind', 'status', 'bookingId', 'recipientHash', 'createdAt'],
  },
  fields: [
    { name: 'kind', type: 'select', required: true, options: ['confirmation', 'reminder', 'waitlist', 'intent', 'waitlist-optin'] },
    { name: 'status', type: 'select', required: true, options: ['sent', 'failed'] },
    { name: 'bookingId', type: 'number' },
    { name: 'recipientHash', type: 'text', required: true },
    { name: 'errorDetail', type: 'text', admin: { description: 'Sanitized error class — no PII, no provider secrets' } },
  ],
  timestamps: true,
}
