import { z } from 'zod';

// Regex to detect HTML/script tags
export const HTML_TAG_REGEX = /<[^>]+>/;

// URL scheme allowlist to prevent stored XSS via javascript: or data: URLs
export const SAFE_URL_REGEX = /^(https?:\/\/|mailto:|tel:)/i;

export interface ContactLink {
  label: string;
  url: string;
}

export interface ShopConfig {
  // Business branding & identity (FR-335)
  businessName: string;
  businessDescription: string;
  brandName: string; // Backward compatibility alias for businessName
  tagline: string;
  logoUrl?: string;
  colors: {
    primary: string;
    primaryHover: string;
    accent: string;
    background: string;
    cardBackground: string;
    text: string;
    textMuted: string;
  };
  // Locale, timezone, currency (FR-335)
  defaultLocale: string;
  timeZone: string;
  shopTimezone: string; // Backward compatibility alias for timeZone
  currency: string;
  currencyConfirmed: boolean; // Initial setup starts with editable USD and currencyConfirmed = false
  // Service location defaults (FR-338)
  businessServiceAddress?: string;
  businessServiceAddressPublic: boolean;
  outCallCoverageDescription?: string;
  requireStaffApprovalForInCall: boolean;
  // Contact links
  publicContactLinks: ContactLink[];
  // Legacy shop settings
  ftsConfig: string;
  minNoticeMin: number;
}

export const shopConfig: ShopConfig = {
  businessName: 'UnderUndre Sovereign Store',
  businessDescription: 'Productized Engineering & Sovereign Operations Capability Packs',
  brandName: 'UnderUndre Sovereign Store',
  tagline: 'Better Under Undre — Productized Engineering & Sovereign Systems',
  logoUrl: 'https://underundre.com/assets/logo.png',
  colors: {
    primary: '#2563eb',
    primaryHover: '#1d4ed8',
    accent: '#10b981',
    background: '#090d16',
    cardBackground: '#111827',
    text: '#f9fafb',
    textMuted: '#9ca3af',
  },
  defaultLocale: 'en',
  timeZone: 'Asia/Yerevan',
  shopTimezone: 'Asia/Yerevan',
  currency: 'USD',
  currencyConfirmed: false, // Must be confirmed by OWNER before live prices are published
  businessServiceAddress: '',
  businessServiceAddressPublic: false,
  outCallCoverageDescription: 'Standard metropolitan service area coverage',
  requireStaffApprovalForInCall: false,
  publicContactLinks: [
    { label: 'Website', url: 'https://underundre.com' },
  ],
  ftsConfig: 'simple',
  minNoticeMin: 60,
};

// Zod schema to sanitize and validate ShopSettings.greeting
export const greetingSchema = z
  .string()
  .trim()
  .min(1, 'Greeting cannot be empty')
  .max(500, 'Greeting cannot exceed 500 characters')
  .refine((val) => !HTML_TAG_REGEX.test(val), {
    message: 'Greeting must be plain text or Telegram Markdown V2 subset; HTML/script tags are strictly prohibited',
  });

export function validateGreeting(greeting: string): { success: boolean; data?: string; error?: string } {
  const result = greetingSchema.safeParse(greeting);
  if (!result.success) {
    return {
      success: false,
      error: result.error.errors[0]?.message || 'Invalid greeting',
    };
  }
  return {
    success: true,
    data: result.data,
  };
}

// Contact link validation schema (prevents XSS schemes)
export const contactLinkSchema = z.object({
  label: z
    .string()
    .trim()
    .min(1, 'Link label is required')
    .max(50, 'Link label cannot exceed 50 characters')
    .refine((val) => !HTML_TAG_REGEX.test(val), {
      message: 'HTML tags are prohibited in link labels',
    }),
  url: z
    .string()
    .trim()
    .min(1, 'Link URL is required')
    .max(500, 'Link URL cannot exceed 500 characters')
    .refine((val) => SAFE_URL_REGEX.test(val), {
      message: 'URL must use https://, http://, mailto:, or tel: scheme',
    }),
});

// Full business settings validation schema (FR-335)
export const businessSettingsSchema = z.object({
  businessName: z
    .string()
    .trim()
    .min(2, 'Business name must be at least 2 characters')
    .max(120, 'Business name cannot exceed 120 characters')
    .refine((val) => !HTML_TAG_REGEX.test(val), {
      message: 'HTML tags are prohibited in business name',
    }),
  businessDescription: z
    .string()
    .trim()
    .max(1000, 'Business description cannot exceed 1000 characters')
    .refine((val) => !HTML_TAG_REGEX.test(val), {
      message: 'HTML tags are prohibited in business description',
    })
    .optional(),
  logoUrl: z
    .string()
    .trim()
    .max(500)
    .refine((val) => SAFE_URL_REGEX.test(val), {
      message: 'Logo URL must use https:// or http:// scheme',
    })
    .nullable()
    .optional(),
  defaultLocale: z
    .string()
    .trim()
    .min(2)
    .max(10)
    .regex(/^[a-z]{2}(-[A-Z]{2})?$/, 'Locale must be in format "en" or "en-US"')
    .default('en'),
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
    .default('UTC'),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .min(3)
    .max(4)
    .regex(/^[A-Z]{3,4}$/, 'Currency must be 3 or 4 uppercase letters'),
  currencyConfirmed: z.boolean().default(false),
  businessServiceAddress: z
    .string()
    .trim()
    .max(500)
    .refine((val) => !HTML_TAG_REGEX.test(val), {
      message: 'HTML tags are prohibited in business address',
    })
    .nullable()
    .optional(),
  businessServiceAddressPublic: z.boolean().default(false),
  outCallCoverageDescription: z
    .string()
    .trim()
    .max(500)
    .refine((val) => !HTML_TAG_REGEX.test(val), {
      message: 'HTML tags are prohibited in coverage description',
    })
    .nullable()
    .optional(),
  requireStaffApprovalForInCall: z.boolean().default(false),
  publicContactLinks: z.array(contactLinkSchema).max(10).default([]),
});

export type BusinessSettingsInput = z.infer<typeof businessSettingsSchema>;

export function validateBusinessSettings(input: unknown): {
  success: boolean;
  data?: BusinessSettingsInput;
  errors?: Record<string, string>;
} {
  const result = businessSettingsSchema.safeParse(input);
  if (!result.success) {
    const errors: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const path = issue.path.join('.') || 'general';
      errors[path] = issue.message;
    }
    return { success: false, errors };
  }
  return { success: true, data: result.data };
}
