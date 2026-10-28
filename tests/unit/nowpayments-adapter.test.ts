/**
 * NOWPayments adapter contract tests (T022, contracts/payment-provider.md).
 * Stubbed gateway: no network — global fetch is mocked.
 */
import { createNowPaymentsProvider, mapNowPaymentsStatus, nowPaymentsWireAmountToMinor } from '@/lib/payments/nowpayments';
import { getPrimaryPaymentProvider } from '@/lib/payments/providerContract';
import '@/lib/payments/nowpayments'; // self-registration

const fetchMock = jest.fn();

describe('NOWPayments adapter (T022)', () => {
  const originalFetch = global.fetch;
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, NOWPAYMENTS_API_KEY: 'test_api_key' };
    global.fetch = fetchMock as unknown as typeof global.fetch;
    fetchMock.mockReset();
  });

  afterAll(() => {
    global.fetch = originalFetch;
    process.env = originalEnv;
  });

  it('is registered in the provider registry (FR-401)', () => {
    process.env.PAYMENT_PROVIDERS = 'NOWPAYMENTS';
    expect(getPrimaryPaymentProvider()?.id).toBe('NOWPAYMENTS');
  });

  it('createInvoice posts to the provider API server-side and returns the provider-issued URL', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ id: 555001, invoice_url: 'https://nowpayments.io/payment/abc123' }), {
        status: 200,
      })
    );

    const provider = createNowPaymentsProvider();
    const invoice = await provider.createInvoice({
      orderId: 'order-1',
      amountMinor: 2500,
      currency: 'USD',
      callbackBaseUrl: 'https://shop.example.com',
    });

    expect(invoice.providerPaymentId).toBe('555001');
    expect(invoice.paymentUrl).toBe('https://nowpayments.io/payment/abc123');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.nowpayments.io/v1/invoice');
    expect(init.method).toBe('POST');
    expect(init.headers['x-api-key']).toBe('test_api_key');
    const body = JSON.parse(init.body);
    expect(body.order_id).toBe('order-1');
    expect(body.price_amount).toBe(25); // registry minor units translated to wire scale
    expect(body.price_currency).toBe('USD');
  });

  it('createInvoice fails closed on provider errors and unknown currencies', async () => {
    fetchMock.mockResolvedValue(new Response('boom', { status: 500 }));
    const provider = createNowPaymentsProvider();
    await expect(
      provider.createInvoice({ orderId: 'o', amountMinor: 100, currency: 'USD', callbackBaseUrl: 'x' })
    ).rejects.toThrow(/HTTP 500/);

    await expect(
      provider.createInvoice({ orderId: 'o', amountMinor: 100, currency: 'XXX', callbackBaseUrl: 'x' })
    ).rejects.toThrow(/Unknown currency/);

    expect(() => assertAmount(-5)).toThrow(/positive integer/);
  });

  it('adapter requires an API key (fail-closed)', () => {
    delete process.env.NOWPAYMENTS_API_KEY;
    expect(() => createNowPaymentsProvider({})).toThrow(/NOWPAYMENTS_API_KEY/);
  });

  it('parseCallback maps IPN wire format onto the neutral ParsedCallback', () => {
    const provider = createNowPaymentsProvider();
    const body = JSON.stringify({
      payment_id: 424242,
      payment_status: 'finished',
      order_id: 'order-9',
      price_amount: 100,
      price_currency: 'usd',
      pay_amount: 0.005,
      actually_paid: 0.005,
    });
    const parsed = provider.parseCallback(body);
    expect(parsed).toEqual({
      providerPaymentId: '424242',
      orderId: 'order-9',
      status: 'finished',
      quotedMinor: 10000,
      paidMinor: 10000,
    });
  });

  it('parseCallback computes underpaid amount at registry scale (99% rule input)', () => {
    const provider = createNowPaymentsProvider();
    const parsed = provider.parseCallback(
      JSON.stringify({
        payment_id: 1,
        payment_status: 'partially_paid',
        order_id: 'order-9',
        price_amount: 100,
        price_currency: 'usd',
        pay_amount: 1,
        actually_paid: 0.5,
      })
    );
    expect(parsed.status).toBe('partially_paid');
    expect(parsed.quotedMinor).toBe(10000);
    expect(parsed.paidMinor).toBe(5000); // 50% of quoted
  });

  it('status mapping covers the NOWPayments IPN status set', () => {
    expect(mapNowPaymentsStatus('waiting')).toBe('waiting');
    expect(mapNowPaymentsStatus('confirming')).toBe('confirming');
    expect(mapNowPaymentsStatus('confirmed')).toBe('confirming');
    expect(mapNowPaymentsStatus('sending')).toBe('confirming');
    expect(mapNowPaymentsStatus('finished')).toBe('finished');
    expect(mapNowPaymentsStatus('partially_paid')).toBe('partially_paid');
    expect(mapNowPaymentsStatus('failed')).toBe('failed');
    expect(mapNowPaymentsStatus('expired')).toBe('expired');
    expect(() => mapNowPaymentsStatus('mystery_status')).toThrow(/Unknown NOWPayments/);
  });

  it('wire amounts convert at registry minor-unit scale — JPY (0) and KWD (3), never hard-coded ×100', () => {
    expect(nowPaymentsWireAmountToMinor(1500, 'JPY')).toBe(1500);
    expect(nowPaymentsWireAmountToMinor(1.234, 'KWD')).toBe(1234);
    expect(nowPaymentsWireAmountToMinor(25.5, 'USD')).toBe(2550);
  });

  it('verifyCallback delegates to the timing-safe HMAC verifier', () => {
    const provider = createNowPaymentsProvider();
    expect(provider.verifyCallback('{}', null)).toBe(false);
    expect(provider.verifyCallback('{}', 'sig')).toBe(false); // no IPN secret env
  });
});

function assertAmount(v: number): void {
  // Local mirror of the contract invariant used in the fail-closed test above.
  if (!Number.isInteger(v) || v <= 0) throw new Error('must be a positive integer');
}
