/**
 * T024: UNDERPAID flow — staff alert + customer top-up/cancel message,
 * FSM transition persisted, NO auto-confirm. All collaborators mocked.
 */
import { handleUnderpaidPayment, UNDERPAID_STAFF_SLA_HOURS } from '@/lib/payments/underpaid';
import { prisma } from '@/lib/db/prisma';
import { bot } from '@/lib/bot/telegramBot';
import { fulfillPayment } from '@/lib/payments/fulfillment';
import { logDeliveryAttempt } from '@/lib/notifications/deliveryLog';

jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    slotReservation: { updateMany: jest.fn() },
    order: { findUnique: jest.fn() },
    shopSettings: { findUnique: jest.fn() },
  },
}));

jest.mock('@/lib/bot/telegramBot', () => ({
  bot: { api: { sendMessage: jest.fn().mockResolvedValue(true) } },
  sendWithRetry: jest.fn((fn) => fn()),
}));

jest.mock('@/lib/notifications/deliveryLog', () => ({
  logDeliveryAttempt: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/lib/payments/fulfillment', () => ({
  fulfillPayment: jest.fn(),
}));

const mockedPrisma = prisma as unknown as {
  slotReservation: { updateMany: jest.Mock };
  order: { findUnique: jest.Mock };
  shopSettings: { findUnique: jest.Mock };
};
const mockedSend = bot.api.sendMessage as jest.Mock;
const mockedFulfill = fulfillPayment as jest.Mock;

const BASE_INPUT = {
  orderId: 'order-1',
  providerPaymentId: 'np-777',
  quotedMinor: 10000,
  paidMinor: 5000,
  currency: 'USD',
};

describe('UNDERPAID flow (T024)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    mockedPrisma.slotReservation.updateMany.mockResolvedValue({ count: 1 });
    mockedPrisma.order.findUnique.mockResolvedValue({
      orderNumber: 'ORD-42',
      customerTgId: 'tg-customer-1',
    });
    mockedPrisma.shopSettings.findUnique.mockResolvedValue({ staffDestinationChatId: 'chat-staff' });
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('persists the FSM transition PAYMENT_PENDING/HELD → UNDERPAID and clears the hold TTL', async () => {
    const outcome = await handleUnderpaidPayment(BASE_INPUT);

    expect(outcome.reservationUpdated).toBe(true);
    expect(mockedPrisma.slotReservation.updateMany).toHaveBeenCalledWith({
      where: { orderId: 'order-1', status: { in: ['HELD', 'PAYMENT_PENDING'] } },
      data: { status: 'UNDERPAID', holdExpiresAt: null, holdFrozenAt: null },
    });
  });

  it('NO auto-confirm: fulfillPayment is never called from the underpaid path', async () => {
    await handleUnderpaidPayment(BASE_INPUT);
    expect(mockedFulfill).not.toHaveBeenCalled();
  });

  it('sends the staff alert with amounts and the 12h SLA', async () => {
    const outcome = await handleUnderpaidPayment(BASE_INPUT);

    expect(outcome.staffNotified).toBe(true);
    expect(mockedSend).toHaveBeenCalledTimes(2); // staff + customer

    const staffText = mockedSend.mock.calls[0][1] as string;
    expect(staffText).toContain('[UNDERPAYMENT_ALERT]');
    expect(staffText).toContain('ORD-42');
    expect(staffText).toContain('$100.00');
    expect(staffText).toContain('$50.00');
    expect(staffText).toContain(`${UNDERPAID_STAFF_SLA_HOURS}h`);
    expect(staffText).not.toContain('tg-customer-1'); // no PII in staff text beyond necessity
  });

  it('sends the customer a top-up/cancel message (no auto-confirm promise)', async () => {
    const outcome = await handleUnderpaidPayment(BASE_INPUT);

    expect(outcome.customerNotified).toBe(true);
    const customerText = mockedSend.mock.calls[1][1] as string;
    expect(customerText).toContain('incomplete');
    expect(customerText).toContain('Top up');
    expect(customerText).toContain('cancel');
  });

  it('logs both delivery attempts through the delivery log (ACCEPTED)', async () => {
    await handleUnderpaidPayment(BASE_INPUT);
    const targets = (logDeliveryAttempt as jest.Mock).mock.calls.map((c) => c[0]);
    expect(targets).toHaveLength(2);
    expect(targets.every((t) => t.status === 'ACCEPTED')).toBe(true);
    expect(targets.every((t) => t.channel === 'TELEGRAM')).toBe(true);
    // Raw PII never persisted — target is hashed downstream; raw values stay local.
  });

  it('degrades gracefully: no staff chat configured → warn, customer still notified', async () => {
    mockedPrisma.shopSettings.findUnique.mockResolvedValue(null);
    delete process.env.STAFF_CHAT_ID;
    delete process.env.ADMIN_CHAT_ID;

    const outcome = await handleUnderpaidPayment(BASE_INPUT);
    expect(outcome.staffNotified).toBe(false);
    expect(outcome.customerNotified).toBe(true);
  });

  it('degrades gracefully: customer without tgId → staff only', async () => {
    mockedPrisma.order.findUnique.mockResolvedValue({ orderNumber: 'ORD-42', customerTgId: null });
    const outcome = await handleUnderpaidPayment(BASE_INPUT);
    expect(outcome.staffNotified).toBe(true);
    expect(outcome.customerNotified).toBe(false);
    expect(mockedSend).toHaveBeenCalledTimes(1);
  });

  it('staff send failure is logged as FAILED delivery and does not throw', async () => {
    mockedSend.mockRejectedValueOnce(new Error('telegram down'));
    const outcome = await handleUnderpaidPayment(BASE_INPUT);
    expect(outcome.staffNotified).toBe(false);
    expect(outcome.customerNotified).toBe(true);
    const logged = (logDeliveryAttempt as jest.Mock).mock.calls.map((c) => c[0]);
    expect(logged.some((t) => t.status === 'FAILED' && t.errorCode === 'STAFF_ALERT_SEND_FAILED')).toBe(true);
  });

  it('unknown/already-resolved booking: no notifications crash, no auto-confirm', async () => {
    mockedPrisma.slotReservation.updateMany.mockResolvedValue({ count: 0 });
    const outcome = await handleUnderpaidPayment(BASE_INPUT);
    expect(outcome.reservationUpdated).toBe(false);
    expect(mockedFulfill).not.toHaveBeenCalled();
  });
});
