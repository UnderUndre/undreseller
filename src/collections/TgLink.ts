import type { CollectionConfig } from 'payload'

import { adminOnly } from '@/access/adminOnly'

/**
 * Client↔Telegram binding (spec 004 FR-407, review F8): composite uniqueness
 * UNIQUE (chat_id, order_id) — repeated bookings of the same client coexist
 * without overwriting previous links. chatId is PII — purge-канон FR-404.
 */
export const TgLink: CollectionConfig = {
  slug: 'tg-links',
  access: {
    create: () => false, // written via clientBot raw SQL only
    delete: adminOnly,
    read: adminOnly,
    update: () => false,
  },
  admin: {
    group: 'Telegram',
    defaultColumns: ['chatId', 'orderId', 'createdAt'],
  },
  fields: [
    { name: 'chatId', type: 'text', required: true },
    { name: 'orderId', type: 'number', required: true },
  ],
  indexes: [{ unique: true, fields: ['chatId', 'orderId'] }],
  timestamps: true,
}
