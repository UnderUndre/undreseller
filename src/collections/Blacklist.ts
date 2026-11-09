import type { CollectionConfig, CollectionBeforeValidateHook } from 'payload'

import { adminOnly } from '@/access/adminOnly'

/**
 * Customer blacklist (spec 004 FR-406, review F9): a client may be blocked by
 * chatId (Telegram) OR phone (web bookings without Telegram) — at least one
 * identifier required. Payload CompoundIndex has no WHERE clause, so per-channel
 * duplicate prevention is enforced in the beforeValidate hook (works uniformly
 * in dev/test push and prod).
 */

const validateIdentifier: CollectionBeforeValidateHook = async ({ data, operation, req }) => {
  if (operation !== 'create' && operation !== 'update') return data
  if (!data?.chatId && !data?.phone) {
    throw new Error('Either chatId or phone is required')
  }
  // Per-channel uniqueness (partial-index semantics).
  if (data.chatId) {
    const dup = await req.payload.find({
      collection: 'blacklist',
      where: { chatId: { equals: data.chatId } },
      limit: 1,
      overrideAccess: true,
    })
    if (dup.docs.some((d) => String(d.id) !== String(data.id ?? ''))) {
      throw new Error('This chatId is already blacklisted')
    }
  }
  if (data.phone) {
    const dup = await req.payload.find({
      collection: 'blacklist',
      where: { phone: { equals: data.phone } },
      limit: 1,
      overrideAccess: true,
    })
    if (dup.docs.some((d) => String(d.id) !== String(data.id ?? ''))) {
      throw new Error('This phone is already blacklisted')
    }
  }
  return data
}

export const Blacklist: CollectionConfig = {
  slug: 'blacklist',
  access: {
    create: adminOnly,
    delete: adminOnly,
    read: adminOnly,
    update: adminOnly,
  },
  admin: {
    group: 'Telegram',
    defaultColumns: ['chatId', 'phone', 'reason', 'createdBy', 'createdAt'],
  },
  hooks: {
    beforeValidate: [validateIdentifier],
  },
  fields: [
    { name: 'chatId', type: 'text', admin: { description: 'Telegram chat id — optional when phone is set' } },
    { name: 'phone', type: 'text', admin: { description: 'Booking phone — optional when chatId is set' } },
    { name: 'reason', type: 'text', required: true },
    { name: 'createdBy', type: 'text', required: true },
  ],
  timestamps: true,
}
