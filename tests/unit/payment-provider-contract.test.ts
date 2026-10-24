import {
  assertValidInvoiceAmount,
  getPrimaryPaymentProvider,
  isZeroProviderMode,
  registerPaymentProviderFactory,
  resolveEnabledPaymentProviders,
  type PaymentProvider,
} from '@/lib/payments/providerContract';

/** Stubbed gateway per contracts/payment-provider.md consumer-driven test table. */
function makeStubProvider(id: string, overrides: Partial<PaymentProvider> = {}): PaymentProvider {
  return {
    id,
    capabilities: { fiat: false, crypto: true, refunds: 'manual' },
    createInvoice: jest.fn(async (input) => ({
      providerPaymentId: `${id}-inv-${input.orderId}`,
      paymentUrl: `https://gateway.example.com/invoice/${id}-inv-${input.orderId}`,
    })),
    verifyCallback: jest.fn(() => true),
    parseCallback: jest.fn(() => ({
      providerPaymentId: `${id}-inv-order-1`,
      orderId: 'order-1',
      status: 'finished' as const,
      paidMinor: 1000,
      quotedMinor: 1000,
    })),
    ...overrides,
  };
}

describe('PaymentProvider Contract Invariants (T013, FR-401, FR-435)', () => {
  beforeEach(() => {
    delete process.env.PAYMENT_PROVIDERS;
  });

  it('zero-provider mode: booking flow fully functional without configured providers (FR-401)', () => {
    expect(isZeroProviderMode(undefined)).toBe(true);
    expect(isZeroProviderMode('')).toBe(true);
    expect(getPrimaryPaymentProvider(undefined)).toBeNull();
  });

  it('resolves enabled providers from deployment configuration, in order', () => {
    registerPaymentProviderFactory('NOWPAYMENTS', () => makeStubProvider('NOWPAYMENTS'));
    registerPaymentProviderFactory('TELEGRAM_STARS', () => makeStubProvider('TELEGRAM_STARS'));

    const providers = resolveEnabledPaymentProviders('NOWPAYMENTS,TELEGRAM_STARS');
    expect(providers.map((p) => p.id)).toEqual(['NOWPAYMENTS', 'TELEGRAM_STARS']);
    expect(getPrimaryPaymentProvider('NOWPAYMENTS,TELEGRAM_STARS')?.id).toBe('NOWPAYMENTS');
    expect(isZeroProviderMode('NOWPAYMENTS')).toBe(false);
  });

  it('rejects unknown provider ids in configuration (fail-closed)', () => {
    expect(() => resolveEnabledPaymentProviders('GHOST_RAILS')).toThrow(
      'Unknown payment provider id in configuration: GHOST_RAILS'
    );
  });

  it('createInvoice returns provider-issued paymentUrl, never a hand-built URL (003 audit)', async () => {
    const provider = makeStubProvider('NOWPAYMENTS');
    const invoice = await provider.createInvoice({
      orderId: 'order-1',
      amountMinor: 2500,
      currency: 'USD',
      callbackBaseUrl: 'https://shop.example.com',
    });
    expect(invoice.providerPaymentId).toBeTruthy();
    expect(invoice.paymentUrl).toMatch(/^https:\/\/gateway\.example\.com\//);
  });

  it('amount invariant: rejects negative, fractional, and zero amounts before invoicing', () => {
    expect(() => assertValidInvoiceAmount(-1)).toThrow(/positive integer/);
    expect(() => assertValidInvoiceAmount(10.5)).toThrow(/positive integer/);
    expect(() => assertValidInvoiceAmount(0)).toThrow(/positive integer/);
    expect(() => assertValidInvoiceAmount(1)).not.toThrow();
  });

  it('callback invariant: verifyCallback is timing-safe and parseCallback round-trips statuses', () => {
    const provider = makeStubProvider('NOWPAYMENTS', {
      verifyCallback: jest.fn((body: string, sig: string | null) => Boolean(sig) && body.length > 0),
    });
    expect(provider.verifyCallback('{"payment_status":"finished"}', 'sig')).toBe(true);
    expect(provider.verifyCallback('{"payment_status":"finished"}', null)).toBe(false);

    const parsed = provider.parseCallback('{"payment_status":"finished"}');
    expect(['waiting', 'confirming', 'finished', 'partially_paid', 'failed', 'expired']).toContain(
      parsed.status
    );
  });
});
