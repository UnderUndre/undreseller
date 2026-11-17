import type { GlobalConfig } from 'payload'

import { adminOnly } from '@/access/adminOnly'
import { adminOnlyFieldAccess } from '@/access/adminOnlyFieldAccess'
import { publicAccess } from '@/access/publicAccess'

/**
 * Instance-level shop settings (spec 002-booking-domain US3, research D3):
 * timeZone drives ALL slot computation (fixed-offset, legacy "inert timezone"
 * lesson); quantumMin is the slot grid step.
 */
export const ShopSettings: GlobalConfig = {
  slug: 'shop-settings',
  access: {
    read: publicAccess,
    update: adminOnly,
  },
  fields: [
    {
      name: 'timeZone',
      type: 'text',
      defaultValue: 'UTC',
      admin: { description: 'IANA timezone for slot computation (e.g. Asia/Yerevan)' },
    },
    {
      name: 'quantumMin',
      type: 'number',
      defaultValue: 30,
      min: 5,
      max: 240,
      admin: { description: 'Slot grid step in minutes' },
    },
    {
      name: 'fromEmail',
      type: 'email',
      admin: {
        description:
          'Sender address for booking emails (fallback for RESEND_FROM_EMAIL, spec 003 FR-305)',
      },
    },
    {
      name: 'confirmationNoticeHours',
      type: 'number',
      defaultValue: 24,
      min: 1,
      max: 168,
      admin: {
        description: 'Hours before start to send the reminder email (spec 003 US3, default 24h)',
      },
    },
    {
      name: 'staffChatIds',
      type: 'array',
      // Review F4: the global itself is publicly readable (storefront needs
      // timeZone/quantum) — staff chat ids are PII and stay OWNER-only.
      access: {
        read: adminOnlyFieldAccess,
        update: adminOnlyFieldAccess,
      },
      admin: { description: 'Telegram chat ids of staff pager recipients (spec 004 FR-402, L1 auth)' },
      fields: [{ name: 'chatId', type: 'text', required: true }],
    },
    {
      name: 'defaultLocale',
      type: 'select',
      defaultValue: 'ru',
      options: [
        { label: 'Русский', value: 'ru' },
        { label: 'English', value: 'en' },
      ],
      admin: { description: 'Bot strings locale (spec 004 US3, botStrings without per-staff override)' },
    },
    {
      name: 'aiTriageEnabled',
      type: 'checkbox',
      defaultValue: true,
      admin: { description: 'Enable async local LLM triage for bookings with customerNotes (spec 013)' },
    },
    {
      name: 'aiDelegationLimit',
      type: 'number',
      defaultValue: 1500,
      min: 0,
      admin: { description: 'Max estimated amount delegable to OPERATOR without OWNER escalation (spec 013)' },
    },
    {
      name: 'aiDelegationCurrency',
      type: 'select',
      defaultValue: 'AED',
      options: ['AED', 'USD', 'RUB', 'EUR'],
      admin: { description: 'Exact currency matched against aiDelegationLimit (spec 013)' },
    },
    {
      name: 'aiMinConfidence',
      type: 'number',
      defaultValue: 0.8,
      min: 0,
      max: 1,
      admin: { description: 'Minimum extraction confidence (0..1) required for OPERATOR delegation (spec 013)' },
    },
    {
      name: 'ownerChatIds',
      type: 'array',
      access: {
        read: adminOnlyFieldAccess,
        update: adminOnlyFieldAccess,
      },
      admin: { description: 'Dedicated Telegram chat ids for OWNER AI triage escalations (spec 013)' },
      fields: [{ name: 'chatId', type: 'text', required: true }],
    },
  ],
}
