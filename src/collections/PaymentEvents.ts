import type { CollectionConfig } from 'payload'

import { adminOnly } from '@/access/adminOnly'

/**
 * Payment event ledger (spec 003 FR-303, STRIDE-R): every processed gateway
 * event lands here with its verdict (PROCESSED / AMOUNT_MISMATCH:* / UNMATCHED).
 * Append-only — the repudiation evidence trail.
 */
export const PaymentEvents: CollectionConfig = {
  slug: 'payment-events',
  access: {
    create: () => false, // written only via raw SQL inside gateway transactions
    delete: () => false,
    read: adminOnly,
    update: () => false,
  },
  admin: {
    group: 'Payments',
    defaultColumns: ['provider', 'providerRef', 'eventType', 'status', 'amountMinor', 'createdAt'],
  },
  fields: [
    { name: 'provider', type: 'text', required: true },
    { name: 'providerRef', type: 'text', required: true },
    { name: 'eventType', type: 'text', required: true },
    { name: 'amountMinor', type: 'number' },
    { name: 'currency', type: 'text' },
    { name: 'status', type: 'text', required: true },
    { name: 'payloadJson', type: 'json', admin: { condition: () => false } },
  ],
  timestamps: true,
}
