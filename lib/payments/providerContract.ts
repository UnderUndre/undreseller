/**
 * PaymentProvider Contract (T013, FR-401, FR-435)
 * Provider-neutral payment boundary: HTTP handlers, bots, and future API/MCP surfaces
 * are thin controllers over this; adapters translate provider wire formats here.
 * Standards: NIST SP 800-218 SSDF & ISO/IEC/IEEE 12207:2017
 */

export type CallbackStatus =
  | 'waiting'
  | 'confirming'
  | 'finished'
  | 'partially_paid'
  | 'failed'
  | 'expired';

export interface PaymentProviderInvoiceInput {
  orderId: string;
  /** Registry minor units — never ×100 here (T026 removes the arithmetic remnant). */
  amountMinor: number;
  /** ISO 4217 code from CurrencyMetadata. */
  currency: string;
  callbackBaseUrl: string;
}

export interface PaymentProviderInvoice {
  providerPaymentId: string;
  /** URL returned by the PROVIDER API — hand-built URLs are prohibited (003 audit). */
  paymentUrl: string;
}

export interface ParsedCallback {
  providerPaymentId: string;
  orderId: string;
  status: CallbackStatus;
  paidMinor: number;
  quotedMinor: number;
}

export interface PaymentProvider {
  readonly id: 'NOWPAYMENTS' | 'TELEGRAM_STARS' | (string & {});
  readonly capabilities: { fiat: boolean; crypto: boolean; refunds: 'automatic' | 'manual' };

  createInvoice(input: PaymentProviderInvoiceInput): Promise<PaymentProviderInvoice>;

  /** HMAC verification, timing-safe. */
  verifyCallback(rawBody: string, signature: string | null): boolean;

  parseCallback(rawBody: string): ParsedCallback;
}

// ---------------------------------------------------------------------------
// Registry (FR-401): enabled providers resolved from deployment configuration.
// Zero providers configured = booking fully functional on free-track semantics.
// ---------------------------------------------------------------------------

const PROVIDER_FACTORIES: Record<string, () => PaymentProvider> = {};

export function registerPaymentProviderFactory(
  id: string,
  factory: () => PaymentProvider
): void {
  PROVIDER_FACTORIES[id] = factory;
}

/**
 * Resolves the enabled provider set from deployment configuration.
 * Config source: PAYMENT_PROVIDERS env (comma-separated ids) or explicit injection.
 */
export function resolveEnabledPaymentProviders(
  config: string | undefined = process.env.PAYMENT_PROVIDERS
): PaymentProvider[] {
  if (!config) return [];
  const providers: PaymentProvider[] = [];
  for (const rawId of config.split(',')) {
    const id = rawId.trim();
    if (!id) continue;
    const factory = PROVIDER_FACTORIES[id];
    if (!factory) {
      throw new Error(`Unknown payment provider id in configuration: ${id}`);
    }
    providers.push(factory());
  }
  return providers;
}

/** Primary provider for invoice creation, or null in zero-provider mode. */
export function getPrimaryPaymentProvider(
  config?: string
): PaymentProvider | null {
  const providers = resolveEnabledPaymentProviders(config);
  return providers.length > 0 ? providers[0] : null;
}

export function isZeroProviderMode(config?: string): boolean {
  return getPrimaryPaymentProvider(config) === null;
}

// ---------------------------------------------------------------------------
// Contract invariants shared by all adapters (unit-tested for every adapter).
// ---------------------------------------------------------------------------

/**
 * Validates amounts against registry minor units (STRIDE Tampering countermeasure):
 * negative, non-integer, or zero-scale-drift amounts must be rejected before an
 * invoice is created.
 */
export function assertValidInvoiceAmount(amountMinor: number): void {
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) {
    throw new Error(`Invalid invoice amountMinor: ${amountMinor} (must be a positive integer in registry minor units)`);
  }
}
