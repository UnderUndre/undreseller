/**
 * T026: minor-unit amounts at CurrencyMetadata scale across payment paths —
 * multi-currency coverage: JPY (minorUnit 0), KWD (minorUnit 3), USD (2).
 */
import { formatMinorUnits, getCurrencyMetadata, majorToMinorUnits, resolveServicePrice } from '../../config/currency-registry';
import { nowPaymentsWireAmountToMinor, processNowPaymentsNotification } from '@/lib/payments/nowpayments';
import { formatStaffOrderCard } from '@/lib/bot/staffBot';
import { fulfillPayment } from '@/lib/payments/fulfillment';

jest.mock('@/lib/payments/fulfillment', () => ({
  fulfillPayment: jest.fn().mockResolvedValue({ status: 'PAID', requiresOperatorAction: false }),
}));

const mockedFulfill = fulfillPayment as jest.Mock;

describe('Minor-unit scale across payment paths (T026, FR-405)', () => {
  beforeEach(() => {
    mockedFulfill.mockClear();
  });

  it('registry metadata: JPY has minorUnit 0, KWD has minorUnit 3', () => {
    expect(getCurrencyMetadata('JPY')?.minorUnit).toBe(0);
    expect(getCurrencyMetadata('KWD')?.minorUnit).toBe(3);
    expect(getCurrencyMetadata('USD')?.minorUnit).toBe(2);
  });

  it('majorToMinorUnits uses registry scale — never hard-coded ×100', () => {
    expect(majorToMinorUnits(1500, 'JPY')).toBe(1500);      // 0 decimals
    expect(majorToMinorUnits(1.234, 'KWD')).toBe(1234);     // 3 decimals
    expect(majorToMinorUnits(25.5, 'USD')).toBe(2550);      // 2 decimals
    expect(nowPaymentsWireAmountToMinor(1500, 'JPY')).toBe(1500);
    expect(nowPaymentsWireAmountToMinor(1.234, 'KWD')).toBe(1234);
  });

  it('formatMinorUnits renders registry scale (no phantom decimals on JPY)', () => {
    expect(formatMinorUnits(1500, 'JPY')).toBe('¥1,500');
    expect(formatMinorUnits(1234, 'KWD')).toBe('KD1.234');
    expect(formatMinorUnits(2550, 'USD')).toBe('$25.50');
  });

  it('resolveServicePrice leaves minor-unit integers untouched regardless of currency scale', () => {
    const item = { priceMinor: 1500, outCallPriceMinor: 2000, outCallTravelFeeMinor: 500 };
    const jpy = resolveServicePrice(item, 'OUT_CALL', 'JPY');
    expect(jpy.totalMinor).toBe(2500);
    expect(jpy.formattedTotal).toBe('¥2,500');
    const kwd = resolveServicePrice(item, 'OUT_CALL', 'KWD');
    expect(kwd.totalMinor).toBe(2500);
    expect(kwd.formattedTotal).toBe('KD2.500');
  });

  it('staff order card renders amounts at registry scale (JPY / KWD)', () => {
    const base = {
      orderId: 'o1',
      orderNumber: 'ORD-1',
      serviceTitles: ['S'],
      totalDurationMin: 60,
      startTimeIso: '2026-01-01T10:00:00.000Z',
      endTimeIso: '2026-01-01T11:00:00.000Z',
      paymentType: 'PREPAYMENT_ONLINE',
      hasCustomerNotes: false,
      customerNotes: null,
      isNewClient: true,
    };
    expect(formatStaffOrderCard({ ...base, totalMinor: 1500, currency: 'JPY' })).toContain('1500 JPY');
    expect(formatStaffOrderCard({ ...base, totalMinor: 1234, currency: 'KWD' })).toContain('1.234 KWD');
    expect(formatStaffOrderCard({ ...base, totalMinor: 2550, currency: 'USD' })).toContain('25.50 USD');
  });

  it('finished IPN in JPY stores amountMinor at registry scale 0 (no ×100 inflation)', async () => {
    const result = await processNowPaymentsNotification({
      payment_id: 9001,
      payment_status: 'finished',
      order_id: 'order-jpy',
      price_amount: 1500,
      price_currency: 'jpy',
      pay_currency: 'xtr',
      pay_amount: 0.01,
      actually_paid: 0.01,
    });

    expect(result.status).toBe('PAID');
    expect(mockedFulfill).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: 'order-jpy', amountMinor: 1500, currency: 'JPY' })
    );
  });

  it('finished IPN in KWD stores amountMinor at registry scale 3', async () => {
    await processNowPaymentsNotification({
      payment_id: 9002,
      payment_status: 'finished',
      order_id: 'order-kwd',
      price_amount: 1.234,
      price_currency: 'kwd',
      pay_currency: 'xtr',
      pay_amount: 0.004,
      actually_paid: 0.004,
    });

    expect(mockedFulfill).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: 'order-kwd', amountMinor: 1234, currency: 'KWD' })
    );
  });
});
