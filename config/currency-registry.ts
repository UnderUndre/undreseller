/**
 * Maintained ISO 4217 + Explicit Non-ISO Currency Metadata Provider (T006)
 * Standards: ISO 4217, ISO/IEC/IEEE 12207:2017 & NIST SP 800-218 SSDF
 * Requirements: FR-303, FR-335, FR-339
 */

export interface CurrencyInfo {
  code: string;
  minorUnit: number;
  symbol: string;
  name: string;
  active: boolean;
}

export const CURRENCY_REGISTRY: Record<string, CurrencyInfo> = {
  // Common 2-decimal fiat currencies
  USD: { code: 'USD', minorUnit: 2, symbol: '$', name: 'US Dollar', active: true },
  EUR: { code: 'EUR', minorUnit: 2, symbol: '€', name: 'Euro', active: true },
  GBP: { code: 'GBP', minorUnit: 2, symbol: '£', name: 'British Pound', active: true },
  AMD: { code: 'AMD', minorUnit: 2, symbol: '֏', name: 'Armenian Dram', active: true },
  RUB: { code: 'RUB', minorUnit: 2, symbol: '₽', name: 'Russian Ruble', active: true },
  GEL: { code: 'GEL', minorUnit: 2, symbol: '₾', name: 'Georgian Lari', active: true },
  CAD: { code: 'CAD', minorUnit: 2, symbol: 'CA$', name: 'Canadian Dollar', active: true },
  AUD: { code: 'AUD', minorUnit: 2, symbol: 'A$', name: 'Australian Dollar', active: true },
  CHF: { code: 'CHF', minorUnit: 2, symbol: 'CHF', name: 'Swiss Franc', active: true },
  CNY: { code: 'CNY', minorUnit: 2, symbol: '¥', name: 'Chinese Yuan', active: true },
  AED: { code: 'AED', minorUnit: 2, symbol: 'AED', name: 'UAE Dirham', active: true },
  SGD: { code: 'SGD', minorUnit: 2, symbol: 'S$', name: 'Singapore Dollar', active: true },

  // Zero-decimal currencies (minorUnit = 0)
  JPY: { code: 'JPY', minorUnit: 0, symbol: '¥', name: 'Japanese Yen', active: true },
  KRW: { code: 'KRW', minorUnit: 0, symbol: '₩', name: 'South Korean Won', active: true },
  VND: { code: 'VND', minorUnit: 0, symbol: '₫', name: 'Vietnamese Dong', active: true },

  // Three-decimal currencies (minorUnit = 3)
  KWD: { code: 'KWD', minorUnit: 3, symbol: 'KD', name: 'Kuwaiti Dinar', active: true },
  BHD: { code: 'BHD', minorUnit: 3, symbol: 'BD', name: 'Bahraini Dinar', active: true },
  OMR: { code: 'OMR', minorUnit: 3, symbol: 'OMR', name: 'Omani Rial', active: true },

  // Explicit Non-ISO Units (Telegram Stars & Sovereign Units)
  XTR: { code: 'XTR', minorUnit: 0, symbol: '⭐', name: 'Telegram Stars', active: true },
  USDT: { code: 'USDT', minorUnit: 2, symbol: 'USDT', name: 'Tether USD', active: true },
};

/**
 * Returns currency metadata for a given currency code.
 */
export function getCurrencyMetadata(currencyCode: string): CurrencyInfo | null {
  if (!currencyCode) return null;
  const upper = currencyCode.trim().toUpperCase();
  return CURRENCY_REGISTRY[upper] || null;
}

/**
 * Validates whether a currency code is known in the registry.
 */
export function isValidCurrency(currencyCode: string): boolean {
  return getCurrencyMetadata(currencyCode) !== null;
}

/**
 * Formats minor-unit integer amounts into human-readable strings.
 */
export function formatMinorUnits(amountMinor: number, currencyCode: string): string {
  const meta = getCurrencyMetadata(currencyCode);
  const minorUnit = meta ? meta.minorUnit : 2;
  const symbol = meta ? meta.symbol : currencyCode;

  if (minorUnit === 0) {
    return `${symbol}${amountMinor.toLocaleString('en-US')}`;
  }

  const factor = Math.pow(10, minorUnit);
  const major = amountMinor / factor;
  const formattedNumber = major.toLocaleString('en-US', {
    minimumFractionDigits: minorUnit,
    maximumFractionDigits: minorUnit,
  });

  return `${symbol}${formattedNumber}`;
}

/**
 * Converts a provider/user-facing major-unit amount into registry minor units
 * using CurrencyMetadata scale (T026, FR-405) — NEVER hard-coded ×100.
 * JPY (minorUnit 0), KWD/BHD/OMR (minorUnit 3) are handled by the registry.
 */
export function majorToMinorUnits(amountMajor: number, currencyCode: string): number {
  const meta = getCurrencyMetadata(currencyCode);
  const minorUnit = meta ? meta.minorUnit : 2;
  return Math.round(amountMajor * Math.pow(10, minorUnit));
}

export interface ServicePriceBreakdown {
  currency: string;
  servicePriceMinor: number;
  travelFeeMinor: number;
  totalMinor: number;
  formattedServicePrice: string;
  formattedTravelFee: string;
  formattedTotal: string;
}

/**
 * Resolves mode-specific service price and fixed travel fee without relying on legacy OrderItem.currency defaults (FR-303, FR-335, FR-339).
 */
export function resolveServicePrice(
  item: {
    priceMinor: number;
    outCallPriceMinor?: number | null;
    outCallTravelFeeMinor?: number | null;
  },
  fulfillmentMode: 'IN_CALL' | 'OUT_CALL',
  businessCurrency: string
): ServicePriceBreakdown {
  const currency = businessCurrency.trim().toUpperCase();

  let servicePriceMinor = item.priceMinor;
  let travelFeeMinor = 0;

  if (fulfillmentMode === 'OUT_CALL') {
    servicePriceMinor = item.outCallPriceMinor != null ? item.outCallPriceMinor : item.priceMinor;
    travelFeeMinor = item.outCallTravelFeeMinor != null ? Math.max(0, item.outCallTravelFeeMinor) : 0;
  }

  const totalMinor = servicePriceMinor + travelFeeMinor;

  return {
    currency,
    servicePriceMinor,
    travelFeeMinor,
    totalMinor,
    formattedServicePrice: formatMinorUnits(servicePriceMinor, currency),
    formattedTravelFee: formatMinorUnits(travelFeeMinor, currency),
    formattedTotal: formatMinorUnits(totalMinor, currency),
  };
}
