/**
 * Shared Admin Content Validation Schemas (T061, US9, FR-436/438/439/440/442)
 * Single source of truth reused by both API routes and admin UI forms —
 * contract requirement: no validation drift between client and server.
 */

import { z } from 'zod';

export const FOUNDATION_SETTINGS_FIELDS = [
  'currency',
  'timeZone',
  'defaultLocale',
  'enabledLocales',
  'currencyConfirmed',
] as const;

export type FoundationSettingsField = (typeof FOUNDATION_SETTINGS_FIELDS)[number];

// ---------------------------------------------------------------------------
// Services / catalog items (FR-436, FR-439, FR-440)
// ---------------------------------------------------------------------------

/** Duration quantum: 15-minute grid (FR-439). */
export const DURATION_QUANTUM_MIN = 15;

export const durationQuantumSchema = z
  .number()
  .int()
  .min(15)
  .max(480)
  .refine((v) => v % DURATION_QUANTUM_MIN === 0, {
    message: `Duration must be a multiple of ${DURATION_QUANTUM_MIN} minutes`,
  });

export const adminServiceCreateSchema = z.object({
  title: z.string().trim().min(2).max(120),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  description: z.string().trim().max(1000).default(''),
  durationMin: durationQuantumSchema.default(60),
  priceMinor: z.number().int().min(0),
  currency: z.string().trim().length(3).toUpperCase().optional(),
  inCallEnabled: z.boolean().default(true),
  outCallEnabled: z.boolean().default(false),
  outCallPriceMinor: z.number().int().min(0).nullable().optional(),
  outCallTravelFeeMinor: z.number().int().min(0).default(0),
  bufferBeforeMin: z.number().int().min(0).max(120).default(0),
  bufferAfterMin: z.number().int().min(0).max(120).default(0),
  outCallTravelBeforeMin: z.number().int().min(0).max(120).default(0),
  outCallTravelAfterMin: z.number().int().min(0).max(120).default(0),
  cancellationCutoffHours: z.number().int().min(1).max(72).default(3),
  requiresFullPrepayment: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

export const adminServiceUpdateSchema = z.object({
  title: z.string().trim().min(2).max(120).optional(),
  description: z.string().trim().max(1000).optional(),
  durationMin: durationQuantumSchema.optional(),
  priceMinor: z.number().int().min(0).optional(),
  inCallEnabled: z.boolean().optional(),
  outCallEnabled: z.boolean().optional(),
  outCallPriceMinor: z.number().int().min(0).nullable().optional(),
  outCallTravelFeeMinor: z.number().int().min(0).optional(),
  bufferBeforeMin: z.number().int().min(0).max(120).optional(),
  bufferAfterMin: z.number().int().min(0).max(120).optional(),
  outCallTravelBeforeMin: z.number().int().min(0).max(120).optional(),
  outCallTravelAfterMin: z.number().int().min(0).max(120).optional(),
  cancellationCutoffHours: z.number().int().min(1).max(72).optional(),
  requiresFullPrepayment: z.boolean().optional(),
  isActive: z.boolean().optional(),
  /** Manual ordering (arrow reorder swaps this value between neighbours). */
  sortOrder: z.number().int().min(0).optional(),
});

export type AdminServiceCreateInput = z.infer<typeof adminServiceCreateSchema>;
export type AdminServiceUpdateInput = z.infer<typeof adminServiceUpdateSchema>;

// ---------------------------------------------------------------------------
// Portfolio items (FR-440)
// ---------------------------------------------------------------------------

export const adminPortfolioItemCreateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(1000).nullable().optional(),
  mediaUrl: z.string().trim().min(1).max(500),
  sortOrder: z.number().int().min(0).optional(),
  isPublished: z.boolean().default(true),
});

export const adminPortfolioItemUpdateSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  isPublished: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

export type AdminPortfolioItemCreateInput = z.infer<typeof adminPortfolioItemCreateSchema>;
export type AdminPortfolioItemUpdateInput = z.infer<typeof adminPortfolioItemUpdateSchema>;

// ---------------------------------------------------------------------------
// Settings (FR-438, FR-442)
// ---------------------------------------------------------------------------

/** Operational settings: OPERATOR and above may change. */
export const operationalSettingsSchema = z.object({
  confirmationNoticeHours: z.number().int().min(1).max(168).optional(),
  requireStaffApprovalForInCall: z.boolean().optional(),
  /** FR-442: slot grid is strictly 15 or 30 minutes. */
  slotGridStepMin: z.union([z.literal(15), z.literal(30)]).optional(),
});

/** Foundation settings: OWNER only, server-enforced (contract test line). */
export const foundationSettingsSchema = z.object({
  currency: z.string().trim().min(3).max(4).toUpperCase().optional(),
  currencyConfirmed: z.boolean().optional(),
  timeZone: z
    .string()
    .trim()
    .min(1)
    .refine((tz) => {
      try {
        Intl.DateTimeFormat(undefined, { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    }, { message: 'Must be a valid IANA timezone (e.g. UTC, Asia/Yerevan)' })
    .optional(),
  defaultLocale: z
    .string()
    .trim()
    .min(2)
    .max(10)
    .regex(/^[a-z]{2}(-[A-Z]{2})?$/)
    .optional(),
  enabledLocales: z.array(z.string().trim().min(2).max(10)).min(1).optional(),
});

export type OperationalSettingsInput = z.infer<typeof operationalSettingsSchema>;
export type FoundationSettingsInput = z.infer<typeof foundationSettingsSchema>;

export interface SettingsPartitionResult {
  foundation: Partial<FoundationSettingsInput>;
  operational: Partial<OperationalSettingsInput>;
  unknownKeys: string[];
}

/**
 * Splits an incoming PATCH body into foundation (OWNER-only) and operational
 * fields. Pure function so the OWNER-enforcement decision is unit-testable.
 */
export function partitionSettingsBody(body: Record<string, unknown>): SettingsPartitionResult {
  const foundation: Record<string, unknown> = {};
  const operational: Record<string, unknown> = {};
  const unknownKeys: string[] = [];

  const foundationKeys = new Set<string>(FOUNDATION_SETTINGS_FIELDS);
  const operationalKeys = new Set<string>(Object.keys(operationalSettingsSchema.shape));

  for (const [key, value] of Object.entries(body)) {
    if (foundationKeys.has(key)) {
      foundation[key] = value;
    } else if (operationalKeys.has(key)) {
      operational[key] = value;
    } else {
      unknownKeys.push(key);
    }
  }

  return {
    foundation: foundation as Partial<FoundationSettingsInput>,
    operational: operational as Partial<OperationalSettingsInput>,
    unknownKeys,
  };
}
