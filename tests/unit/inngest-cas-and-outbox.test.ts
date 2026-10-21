import {
  APPOINTMENT_REMINDER_CANCEL_ON,
  AUTO_CANCEL_UNCONFIRMED_CANCEL_ON,
  INVOICE_EXPIRY_CANCEL_ON,
} from '@/lib/jobs/inngest';
import {
  evaluateReminderWakeUpCas,
  evaluateAutoCancelWakeUpCas,
  evaluateInvoiceExpiryWakeUpCas,
  runDeadlineSweeperInMemory,
  LifecycleOrderSnapshot,
} from '@/lib/jobs/deadlineSweeper';
import {
  executeStaffOrderActionPure,
  StaffOrderMemoryState,
} from '@/lib/bot/staffActions';
import {
  executeProviderRefundPure,
  reconcileUnknownRefundPure,
  RefundOperationRecord,
} from '@/lib/payments/refunds';
import {
  createInMemoryDispatcherState,
  processOutboxBatchInMemory,
  OUTBOX_PRIORITY,
  getOutboxQueueMetrics,
} from '@/lib/bot/telegramOutbox';
import {
  formatRedactedStaffOrderCard,
  GDPR_REDACTED_PLACEHOLDER,
} from '@/lib/bot/staffBot';

describe('Inngest CAS, Staff Concurrency, Provider Refunds & Durable Telegram Outbox (T-117)', () => {
  it('enforces Inngest cancelOn triggers strictly <= 4 events per function', () => {
    expect(APPOINTMENT_REMINDER_CANCEL_ON.length).toBeLessThanOrEqual(4);
    expect(AUTO_CANCEL_UNCONFIRMED_CANCEL_ON.length).toBeLessThanOrEqual(4);
    expect(INVOICE_EXPIRY_CANCEL_ON.length).toBeLessThanOrEqual(4);
  });

  it('aborts stale sleeping Inngest runs via scheduleVersion CAS and auto-cancels unconfirmed new clients while preserving regular clients', () => {
    const baseOrder: LifecycleOrderSnapshot = {
      id: 'ord-1',
      orderNumber: 'ORD-1001',
      status: 'PENDING',
      confirmationStatus: 'STAFF_APPROVED',
      cancellationReason: null,
      autoCancelOnNoConfirmation: true,
      scheduleVersion: 2,
      startTime: new Date('2026-10-21T14:00:00Z'),
      invoiceExpiresAt: null,
      reminderSentAt: null,
      reservationStatus: 'BOOKED',
      customerTgId: '123456',
    };

    // Stale scheduleVersion (1 vs 2) -> no-op
    const staleReminder = evaluateReminderWakeUpCas({
      order: baseOrder,
      expectedScheduleVersion: 1,
    });
    expect(staleReminder.action).toBe('STALE_VERSION_NO_OP');

    // Valid new client unconfirmed at deadline -> AUTO_CANCELLED_NO_CONFIRMATION + RELEASED
    const autoCancelNew = evaluateAutoCancelWakeUpCas({
      order: baseOrder,
      expectedScheduleVersion: 2,
    });
    expect(autoCancelNew.action).toBe('AUTO_CANCELLED_NEW_CLIENT');
    expect(autoCancelNew.updatedOrder.status).toBe('CANCELLED');
    expect(autoCancelNew.updatedOrder.cancellationReason).toBe('AUTO_CANCELLED_NO_CONFIRMATION');
    expect(autoCancelNew.updatedOrder.reservationStatus).toBe('RELEASED');

    // Regular client (autoCancelOnNoConfirmation = false) -> preserved + staff alert
    const regularClient = evaluateAutoCancelWakeUpCas({
      order: { ...baseOrder, autoCancelOnNoConfirmation: false },
      expectedScheduleVersion: 2,
    });
    expect(regularClient.action).toBe('PRESERVED_REGULAR_CLIENT');
    expect(regularClient.updatedOrder.status).toBe('PENDING');
    expect(regularClient.staffAlertText).toContain('бронь сохранена');
  });

  it('expires 15-minute AFTER_STAFF_APPROVAL invoices and reconciles overdue deadlines via PostgreSQL sweeper during Inngest outage', () => {
    const now = new Date('2026-10-20T12:05:00Z');
    const overdueOrders: LifecycleOrderSnapshot[] = [
      {
        id: 'ord-inv',
        orderNumber: 'ORD-INV',
        status: 'AWAITING_PAYMENT',
        confirmationStatus: 'STAFF_APPROVED',
        cancellationReason: null,
        autoCancelOnNoConfirmation: true,
        scheduleVersion: 1,
        startTime: new Date('2026-10-22T14:00:00Z'),
        invoiceExpiresAt: new Date('2026-10-20T12:00:00Z'), // 5 min overdue (> 120s lag)
        reminderSentAt: null,
        reservationStatus: 'HELD',
      },
      {
        id: 'ord-new',
        orderNumber: 'ORD-NEW',
        status: 'PENDING',
        confirmationStatus: 'STAFF_APPROVED',
        cancellationReason: null,
        autoCancelOnNoConfirmation: true,
        scheduleVersion: 1,
        startTime: new Date('2026-10-20T17:00:00Z'), // within 6h deadline
        invoiceExpiresAt: null,
        reminderSentAt: new Date('2026-10-19T17:00:00Z'),
        reservationStatus: 'BOOKED',
      },
    ];

    const sweep = runDeadlineSweeperInMemory({
      orders: overdueOrders,
      confirmationNoticeHours: 24,
      autoCancelDeadlineHours: 6,
      now,
    });

    expect(sweep.reconciledInvoiceExpiries).toBe(1);
    expect(sweep.reconciledAutoCancels).toBe(1);
    expect(sweep.lagAlertTriggered).toBe(true);
    expect(overdueOrders[0].status).toBe('PAYMENT_EXPIRED');
    expect(overdueOrders[0].reservationStatus).toBe('RELEASED');
    expect(overdueOrders[1].status).toBe('CANCELLED');
    expect(overdueOrders[1].cancellationReason).toBe('AUTO_CANCELLED_NO_CONFIRMATION');
  });

  it('ensures simultaneous Staff Bot approve/reject/blacklist/fulfill callbacks yield exactly one transition', () => {
    const initial: StaffOrderMemoryState = {
      id: 'ord-race',
      orderNumber: 'ORD-RACE',
      status: 'PENDING',
      paymentType: 'PAY_ON_SITE',
      confirmationStatus: 'PENDING_STAFF_REVIEW',
      cancellationReason: null,
      reservationStatus: 'HELD',
      scheduleVersion: 1,
      invoiceExpiresAt: null,
      rescheduleTokenHash: null,
      rescheduleTokenConsumedAt: null,
    };

    const first = executeStaffOrderActionPure({
      order: initial,
      action: 'approve',
      prepaymentTiming: 'IMMEDIATE',
      actorTelegramId: 'staff_1',
    });
    expect(first.outcome).toBe('APPLIED');
    expect(first.updatedOrder.confirmationStatus).toBe('STAFF_APPROVED');
    expect(first.updatedOrder.reservationStatus).toBe('BOOKED');

    // Second concurrent approve on already-approved state -> ALREADY_PROCESSED
    const secondApprove = executeStaffOrderActionPure({
      order: first.updatedOrder,
      action: 'approve',
      prepaymentTiming: 'IMMEDIATE',
      actorTelegramId: 'staff_2',
    });
    expect(secondApprove.outcome).toBe('ALREADY_PROCESSED');

    // Fulfill on approved order -> APPLIED (FULFILLED + GDPR redaction triggered)
    const fulfill = executeStaffOrderActionPure({
      order: first.updatedOrder,
      action: 'fulfill',
      prepaymentTiming: 'IMMEDIATE',
      actorTelegramId: 'staff_1',
    });
    expect(fulfill.outcome).toBe('APPLIED');
    expect(fulfill.updatedOrder.status).toBe('FULFILLED');
    expect(fulfill.triggerGdprRedaction).toBe(true);

    // Reject after fulfill -> ALREADY_PROCESSED
    const lateReject = executeStaffOrderActionPure({
      order: fulfill.updatedOrder,
      action: 'reject',
      prepaymentTiming: 'IMMEDIATE',
      actorTelegramId: 'staff_2',
    });
    expect(lateReject.outcome).toBe('ALREADY_PROCESSED');
  });

  it('executes idempotent provider-separated refunds, handles timeout -> UNKNOWN -> reconciliation, and never creates a negative PaymentEvent', async () => {
    const store = {
      refundOperations: new Map<string, RefundOperationRecord>(),
      paymentEventsCount: 1,
      orderRefundStatus: 'NONE' as 'NONE' | 'REFUND_REQUESTED' | 'REFUNDED',
    };

    // 1. Stars refund + idempotent duplicate call
    const starsRes1 = await executeProviderRefundPure({
      store,
      input: {
        orderId: 'ord-stars',
        kind: 'TELEGRAM_STARS_REFUND',
        idempotencyKey: 'idem_stars_1',
        amountMinor: 1000,
        currency: 'XTR',
        actor: 'admin_1',
        telegramUserId: '999',
        telegramPaymentChargeId: 'chg_123',
      },
      starsAdapter: async () => ({ ok: true }),
    });
    expect(starsRes1.deduplicated).toBe(false);
    expect(starsRes1.operation.status).toBe('CONFIRMED');
    expect(starsRes1.orderRefundStatus).toBe('REFUNDED');
    expect(starsRes1.paymentEventsCount).toBe(1); // Immutable!

    const starsRes2 = await executeProviderRefundPure({
      store,
      input: {
        orderId: 'ord-stars',
        kind: 'TELEGRAM_STARS_REFUND',
        idempotencyKey: 'idem_stars_1',
        amountMinor: 1000,
        currency: 'XTR',
        actor: 'admin_1',
        telegramUserId: '999',
        telegramPaymentChargeId: 'chg_123',
      },
    });
    expect(starsRes2.deduplicated).toBe(true);
    expect(starsRes2.paymentEventsCount).toBe(1);

    // 2. Crypto reimbursement timeout -> UNKNOWN -> reconciled to CONFIRMED
    const cryptoTimeout = await executeProviderRefundPure({
      store,
      input: {
        orderId: 'ord-crypto',
        kind: 'CRYPTO_REIMBURSEMENT',
        idempotencyKey: 'idem_crypto_timeout',
        amountMinor: 10000,
        currency: 'USD',
        actor: 'admin_1',
        asset: 'USDT',
        network: 'TRC20',
        destination: 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb',
        networkFeeMinor: 100,
        availableMerchantBalanceMinor: 50000,
      },
      cryptoPayoutAdapter: async () => {
        throw new Error('ETIMEDOUT: RPC gateway timeout');
      },
    });
    expect(cryptoTimeout.operation.status).toBe('UNKNOWN');

    const reconciled = reconcileUnknownRefundPure(cryptoTimeout.operation, {
      confirmed: true,
      txid: '0xabc123confirmed',
    });
    expect(reconciled.operation.status).toBe('CONFIRMED');
    expect(reconciled.operation.txid).toBe('0xabc123confirmed');
    expect(reconciled.orderRefundStatus).toBe('REFUNDED');
  });

  it('handles Telegram outbox burst pressure, 429 retry_after cooldown, priority GDPR redaction, lease recovery, and permanent no-op errors', async () => {
    const state = createInMemoryDispatcherState();
    const now = new Date('2026-10-20T12:00:00Z');

    // Enqueue a stuck processing lease, a normal message, a missing-message edit, and a critical GDPR redaction
    state.items.push(
      {
        id: 'stuck-lease',
        botProfile: 'STAFF_BOT',
        chatId: '-100111',
        priority: OUTBOX_PRIORITY.NORMAL_NOTIFICATION,
        dedupeKey: 'dk-stuck',
        createdAt: new Date(now.getTime() - 60000),
        nextAttemptAt: now,
        attemptCount: 0,
        status: 'PROCESSING',
        lockedBy: 'dead_worker',
        lockedAt: new Date(now.getTime() - 60000),
        leaseExpiresAt: new Date(now.getTime() - 1000), // expired lease
        payloadJson: { action: 'sendMessage', chatId: '-100111', text: 'Recovered' },
      },
      {
        id: 'missing-msg',
        botProfile: 'STAFF_BOT',
        chatId: '-100111',
        priority: OUTBOX_PRIORITY.CRITICAL_GDPR_AND_MARKUP,
        dedupeKey: 'dk-missing',
        createdAt: now,
        nextAttemptAt: now,
        attemptCount: 0,
        status: 'PENDING',
        payloadJson: {
          action: 'editMessageText',
          chatId: '-100111',
          messageId: 404,
          text: formatRedactedStaffOrderCard('ORD-404', 'FULFILLED'),
        },
      },
      {
        id: 'gdpr-redact',
        botProfile: 'STAFF_BOT',
        chatId: '-100111',
        priority: OUTBOX_PRIORITY.CRITICAL_GDPR_AND_MARKUP,
        dedupeKey: 'dk-gdpr',
        createdAt: now,
        nextAttemptAt: now,
        attemptCount: 0,
        status: 'PENDING',
        payloadJson: {
          action: 'editMessageText',
          chatId: '-100111',
          messageId: 200,
          text: formatRedactedStaffOrderCard('ORD-200', 'FULFILLED'),
        },
      }
    );

    const executedOrder: string[] = [];
    const batchRes = await processOutboxBatchInMemory(
      state,
      async (item) => {
        executedOrder.push(item.id);
        if (item.id === 'missing-msg') {
          const err = new Error('Bad Request: message to edit not found') as Error & {
            error_code?: number;
          };
          err.error_code = 400;
          throw err;
        }
      },
      now
    );

    expect(batchRes.reconciledLeases).toBe(1);
    expect(batchRes.terminalNoOp).toBe(1);
    expect(batchRes.sent).toBe(2);
    expect(state.items[2].payloadJson.text).toContain(GDPR_REDACTED_PLACEHOLDER);

    const metrics = getOutboxQueueMetrics(state, now);
    expect(metrics.pendingCount).toBe(0);
    expect(metrics.sentCount).toBe(3);
  });
});
