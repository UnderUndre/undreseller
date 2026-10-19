import { z } from 'zod';

export interface ShopConfig {
  brandName: string;
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
  shopTimezone: string;
  ftsConfig: string;
  minNoticeMin: number;
}

export const shopConfig: ShopConfig = {
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
  shopTimezone: 'Asia/Yerevan',
  ftsConfig: 'simple',
  minNoticeMin: 60,
};

// Regex to detect HTML/script tags
const HTML_TAG_REGEX = /<[^>]+>/;

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
