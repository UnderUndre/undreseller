import type { CollectionConfig } from 'payload'

import { adminOnly } from '@/access/adminOnly'

/**
 * Durable Telegram outbox (spec 004 US2, research D2): the ONLY outbound
 * Telegram path (FR-401). Typed primitives from the antigravity review F1:
 * `bot` selects the sender, `actionType` the API method, `messageId` +
 * `replyMarkupJson` target edits, `sentMessageId` is captured on sendMessage
 * success (GDPR redaction addresses cards through it, review F2).
 */
export const TelegramOutbox: CollectionConfig = {
  slug: 'telegram-outbox',
  access: {
    create: () => false, // written only via outbox.ts / raw SQL
    delete: adminOnly,
    read: adminOnly,
    update: () => false, // mutated only via the dispatch claim (raw SQL)
  },
  admin: {
    group: 'Telegram',
    defaultColumns: ['bot', 'actionType', 'toChatId', 'priority', 'status', 'attempts', 'createdAt'],
  },
  fields: [
    { name: 'bot', type: 'select', required: true, options: ['staff', 'client'] },
    {
      name: 'actionType',
      type: 'select',
      required: true,
      options: ['sendMessage', 'editMessageText', 'editMessageReplyMarkup'],
    },
    { name: 'toChatId', type: 'text', required: true },
    { name: 'text', type: 'textarea', admin: { condition: () => false } },
    { name: 'messageId', type: 'number', admin: { description: 'Target message for edit* actions' } },
    { name: 'replyMarkupJson', type: 'json', admin: { condition: () => false } },
    {
      name: 'sentMessageId',
      type: 'number',
      admin: { description: 'Captured on sendMessage success — redaction address (review F2)' },
    },
    { name: 'priority', type: 'number', required: true, defaultValue: 10, min: 1, max: 100 },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'queued',
      options: ['queued', 'sending', 'sent', 'failed', 'dead'],
    },
    { name: 'leaseUntil', type: 'date' },
    { name: 'availableAt', type: 'date', admin: { description: '429 retry_after cooldown gate' } },
    { name: 'attempts', type: 'number', required: true, defaultValue: 0 },
    { name: 'lastError', type: 'text', admin: { condition: () => false } },
    { name: 'aggregateType', type: 'text' },
    { name: 'aggregateId', type: 'text' },
    { name: 'metaJson', type: 'json', admin: { condition: () => false } },
  ],
  timestamps: true,
}
