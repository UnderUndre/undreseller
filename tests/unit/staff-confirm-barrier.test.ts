/**
 * T093 (FR-429): staff bot destructive-action confirm barrier and
 * configurable rejection notification policy.
 */

jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    inboxEvent: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() },
    $transaction: jest.fn(),
    order: { findUnique: jest.fn(), updateMany: jest.fn() },
    shopSettings: { findUnique: jest.fn() },
    slotReservation: { update: jest.fn() },
    messengerContact: { upsert: jest.fn() },
  },
}));

jest.mock('@/lib/bot/telegramOutbox', () => ({
  enqueueTelegramOutbox: jest.fn().mockResolvedValue({ id: 'q1', deduplicated: false }),
  OUTBOX_PRIORITY: { HIGH_STAFF_PAGER: 10, CRITICAL_GDPR_AND_MARKUP: 0 },
}));

jest.mock('@/lib/bot/staffBot', () => ({
  enqueueStaffMessageRedaction: jest.fn().mockResolvedValue({ queued: true }),
}));

import {
  awaitConfirmBarrier,
  resetPendingConfirmations,
  isConfirmPending,
  isDestructiveStaffAction,
  CONFIRM_WINDOW_MS,
} from '@/lib/bot/staffConfirm';
import {
  resolveRejectNotifyMode,
  decideRejectNotification,
  executeStaffCallbackTransaction,
} from '@/lib/bot/staffActions';
import { enqueueTelegramOutbox } from '@/lib/bot/telegramOutbox';
import { prisma } from '@/lib/db/prisma';

describe('Confirm barrier (FR-429, T093)', () => {
  beforeEach(() => resetPendingConfirmations());

  it('first press requires confirmation and arms state', () => {
    expect(awaitConfirmBarrier('reject', 'ord-1', 1000)).toBe('REQUIRES_CONFIRMATION');
    expect(isConfirmPending('reject', 'ord-1')).toBe(true);
  });

  it('second press within the window confirms and consumes state', () => {
    awaitConfirmBarrier('reject', 'ord-1', 1000);
    expect(awaitConfirmBarrier('reject', 'ord-1', 1000 + CONFIRM_WINDOW_MS - 1)).toBe('CONFIRMED');
    expect(isConfirmPending('reject', 'ord-1')).toBe(false);
  });

  it('second press after 30s expiry re-arms instead of confirming', () => {
    awaitConfirmBarrier('blacklist', 'ord-2', 1000);
    expect(awaitConfirmBarrier('blacklist', 'ord-2', 1000 + CONFIRM_WINDOW_MS + 1)).toBe(
      'REQUIRES_CONFIRMATION'
    );
  });

  it('keys are isolated per action:orderId', () => {
    awaitConfirmBarrier('reject', 'ord-3', 1000);
    expect(awaitConfirmBarrier('blacklist', 'ord-3', 1100)).toBe('REQUIRES_CONFIRMATION');
    expect(awaitConfirmBarrier('reject', 'ord-4', 1100)).toBe('REQUIRES_CONFIRMATION');
  });

  it('only destructive actions are gated', () => {
    expect(isDestructiveStaffAction('reject')).toBe(true);
    expect(isDestructiveStaffAction('blacklist')).toBe(true);
    expect(isDestructiveStaffAction('approve')).toBe(false);
    expect(isDestructiveStaffAction('fulfill')).toBe(false);
    expect(isDestructiveStaffAction('copy_contacts')).toBe(false);
  });
});

describe('Rejection notification policy (FR-429, T093)', () => {
  const ENV = process.env.STAFF_REJECT_NOTIFY_MODE;

  afterEach(() => {
    if (ENV === undefined) delete process.env.STAFF_REJECT_NOTIFY_MODE;
    else process.env.STAFF_REJECT_NOTIFY_MODE = ENV;
  });

  it('defaults to notify_customer when env is unset or garbage', () => {
    expect(resolveRejectNotifyMode(undefined)).toBe('notify_customer');
    expect(resolveRejectNotifyMode('')).toBe('notify_customer');
    expect(resolveRejectNotifyMode('nonsense')).toBe('notify_customer');
  });

  it('parses all three modes case-insensitively', () => {
    expect(resolveRejectNotifyMode('SILENT')).toBe('silent');
    expect(resolveRejectNotifyMode('Staff_Only')).toBe('staff_only');
    expect(resolveRejectNotifyMode('notify_customer')).toBe('notify_customer');
  });

  it('decideRejectNotification matrix', () => {
    expect(decideRejectNotification('notify_customer', true)).toEqual({
      notifyCustomer: true,
      notifyStaff: false,
    });
    expect(decideRejectNotification('notify_customer', false)).toEqual({
      notifyCustomer: false,
      notifyStaff: false,
    });
    expect(decideRejectNotification('silent', true)).toEqual({
      notifyCustomer: false,
      notifyStaff: false,
    });
    expect(decideRejectNotification('staff_only', true)).toEqual({
      notifyCustomer: false,
      notifyStaff: true,
    });
  });

  function txMock(order: Record<string, unknown>) {
    const tx = {
      inboxEvent: { create: jest.fn().mockResolvedValue({}) },
      order: {
        findUnique: jest.fn().mockResolvedValue(order),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      shopSettings: { findUnique: jest.fn().mockResolvedValue(null) },
      slotReservation: { update: jest.fn().mockResolvedValue({}) },
      messengerContact: { upsert: jest.fn().mockResolvedValue({}) },
    };
    (prisma.$transaction as jest.Mock).mockImplementation((fn: (t: unknown) => Promise<unknown>) => fn(tx));
    return tx;
  }

  const baseOrder = {
    id: 'ord-r1',
    orderNumber: 'ORD-R1',
    status: 'PENDING',
    paymentType: 'PAY_ON_SITE',
    confirmationStatus: 'PENDING_STAFF_REVIEW',
    cancellationReason: null,
    reservation: null,
    scheduleVersion: 1,
    invoiceExpiresAt: null,
    rescheduleTokenHash: null,
    rescheduleTokenConsumedAt: null,
    customerTgId: 'tg-42',
    customerPhone: null,
    staffMessageId: null,
  };

  it('notify_customer mode sends the rejection notice to the customer', async () => {
    process.env.STAFF_REJECT_NOTIFY_MODE = 'notify_customer';
    txMock(baseOrder);
    await executeStaffCallbackTransaction({
      callbackQueryId: 'cbq-1',
      orderId: 'ord-r1',
      action: 'reject',
      actorTelegramId: 'staff-1',
      chatId: 'staff-chat',
    });
    const calls = (enqueueTelegramOutbox as jest.Mock).mock.calls.map((c) => c[0]);
    expect(calls.some((p) => p.botProfile === 'CLIENT_BOT' && p.chatId === 'tg-42')).toBe(true);
  });

  it('silent mode sends no rejection notice at all', async () => {
    process.env.STAFF_REJECT_NOTIFY_MODE = 'silent';
    (enqueueTelegramOutbox as jest.Mock).mockClear();
    txMock(baseOrder);
    await executeStaffCallbackTransaction({
      callbackQueryId: 'cbq-2',
      orderId: 'ord-r1',
      action: 'reject',
      actorTelegramId: 'staff-1',
      chatId: 'staff-chat',
    });
    const calls = (enqueueTelegramOutbox as jest.Mock).mock.calls.map((c) => c[0]);
    expect(calls.some((p) => p.botProfile === 'CLIENT_BOT')).toBe(false);
    expect(calls.some((p) => p.text && p.text.includes('отклонена'))).toBe(false);
  });

  it('staff_only mode redirects the notice to the staff chat', async () => {
    process.env.STAFF_REJECT_NOTIFY_MODE = 'staff_only';
    (enqueueTelegramOutbox as jest.Mock).mockClear();
    txMock(baseOrder);
    await executeStaffCallbackTransaction({
      callbackQueryId: 'cbq-3',
      orderId: 'ord-r1',
      action: 'reject',
      actorTelegramId: 'staff-1',
      chatId: 'staff-chat',
    });
    const calls = (enqueueTelegramOutbox as jest.Mock).mock.calls.map((c) => c[0]);
    expect(calls.some((p) => p.botProfile === 'CLIENT_BOT')).toBe(false);
    expect(
      calls.some((p) => p.botProfile === 'STAFF_BOT' && p.chatId === 'staff-chat' && p.text.includes('отклонена'))
    ).toBe(true);
  });
});
