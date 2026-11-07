import type { CollectionConfig } from 'payload'

import { adminOnly } from '@/access/adminOnly'

/**
 * Append-only audit trail (spec 002-booking-domain FR-210, STRIDE Repudiation).
 * Rows are written ONLY by the booking domain service through the Local API
 * (overrideAccess: true) — no API surface can create/update/delete rows.
 */
export const AuditEvents: CollectionConfig = {
  slug: 'audit-events',
  access: {
    create: () => false,
    delete: () => false,
    read: adminOnly,
    update: () => false,
  },
  admin: {
    group: 'System',
    defaultColumns: ['createdAt', 'action', 'actorId', 'aggregateType', 'aggregateId'],
  },
  fields: [
    { name: 'action', type: 'text', required: true },
    { name: 'actorId', type: 'text', required: true },
    { name: 'aggregateType', type: 'text', required: true },
    { name: 'aggregateId', type: 'text', required: true },
    {
      name: 'metadataJson',
      type: 'json',
      admin: { description: 'PII-redacted context (INV-010 canon)' },
    },
  ],
  indexes: [{ fields: ['aggregateType', 'aggregateId', 'createdAt'] }],
  timestamps: true,
}
