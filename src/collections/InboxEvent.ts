import type { CollectionConfig } from 'payload'

import { adminOnly } from '@/access/adminOnly'

/**
 * Webhook inbox dedupe (spec 003 US2, research D2): one row per (provider,
 * providerRef). The unique pair is the exactly-once gate for gateway events —
 * the insert uses ON CONFLICT DO NOTHING inside the processing transaction, so
 * a Stripe retry either reprocesses cleanly or no-ops (23505-free).
 */
export const InboxEvent: CollectionConfig = {
  slug: 'inbox-events',
  access: {
    create: () => false, // written only via raw SQL inside gateway transactions
    delete: adminOnly,
    read: adminOnly,
    update: () => false,
  },
  admin: {
    group: 'Payments',
    defaultColumns: ['provider', 'providerRef', 'createdAt'],
  },
  fields: [
    { name: 'provider', type: 'text', required: true },
    { name: 'providerRef', type: 'text', required: true },
  ],
  // Composite unique pair — the exactly-once gate for `ON CONFLICT DO NOTHING`.
  indexes: [{ unique: true, fields: ['provider', 'providerRef'] }],
  timestamps: true,
}
