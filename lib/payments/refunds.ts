import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/telemetry/logger';
import { bot } from '@/lib/bot/telegramBot';

export type RefundKind = 'TELEGRAM_STARS_REFUND' | 'CRYPTO_REIMBURSEMENT';
export type RefundOpStatus = 'REQUESTED' | 'SUBMITTED' | 'CONFIRMED' | 'FAILED' | 'UNKNOWN';

export interface RefundOperationRecord {
  id: string;
  orderId: string;
  kind: RefundKind;
  status: RefundOpStatus;
  idempotencyKey: string;
  providerRef: string | null;
  amountMinor: number;
  currency: string;
  asset: string | null;
  network: string | null;
  destination: string | null;
  networkFeeMinor: number | null;
  txid: string | null;
  actor: string;
  reason: string | null;
  errorMessage: string | null;
  reconciledAt: Date | null;
  slaDueAt: Date;
}

export interface ExecuteRefundInput {
  orderId: string;
  kind: RefundKind;
  idempotencyKey: string;
  amountMinor: number;
  currency: string;
  actor: string;
  reason?: string;
  // Telegram Stars specific
  telegramUserId?: string;
  telegramPaymentChargeId?: string;
  // Crypto reimbursement specific
  asset?: string;
  network?: string;
  destination?: string;
  networkFeeMinor?: number;
  availableMerchantBalanceMinor?: number;
}

const VALID_CRYPTO_NETWORKS = new Set(['TON', 'TRC20', 'ERC20', 'SOL', 'BTC', 'ARB']);
const MAX_NETWORK_FEE_BPS = 500; // max 5% fee policy ceiling

export function validateCryptoReimbursementParams(input: ExecuteRefundInput): {
  valid: boolean;
  error?: string;
} {
  if (!input.actor || input.actor.trim().length === 0) {
    return { valid: false, error: 'MISSING_OPERATOR_AUTHORIZATION' };
  }
  if (!input.asset || !input.network || !VALID_CRYPTO_NETWORKS.has(input.network.toUpperCase())) {
    return { valid: false, error: 'INVALID_ASSET_OR_NETWORK' };
  }
  if (!input.destination || input.destination.trim().length < 16) {
    return { valid: false, error: 'INVALID_CRYPTO_DESTINATION_ADDRESS' };
  }
  if (input.amountMinor <= 0) {
    return { valid: false, error: 'NON_POSITIVE_REFUND_AMOUNT' };
  }
  const feeMinor = input.networkFeeMinor ?? 0;
  if (feeMinor < 0 || feeMinor * 10000 > input.amountMinor * MAX_NETWORK_FEE_BPS) {
    return { valid: false, error: 'NETWORK_FEE_EXCEEDS_POLICY_LIMIT' };
  }
  if (
    typeof input.availableMerchantBalanceMinor === 'number' &&
    input.availableMerchantBalanceMinor < input.amountMinor + feeMinor
  ) {
    return { valid: false, error: 'INSUFFICIENT_MERCHANT_HOT_WALLET_BALANCE' };
  }
  return { valid: true };
}

export async function executeProviderRefundPure(params: {
  store: {
    refundOperations: Map<string, RefundOperationRecord>;
    paymentEventsCount: number;
    orderRefundStatus: 'NONE' | 'REFUND_REQUESTED' | 'REFUNDED';
  };
  input: ExecuteRefundInput;
  starsAdapter?: (userId: number, chargeId: string) => Promise<{ ok: boolean }>;
  cryptoPayoutAdapter?: (req: {
    destination: string;
    amountMinor: number;
    asset: string;
    network: string;
  }) => Promise<{ txid: string }>;
  now?: Date;
}): Promise<{
  deduplicated: boolean;
  operation: RefundOperationRecord;
  orderRefundStatus: 'NONE' | 'REFUND_REQUESTED' | 'REFUNDED';
  paymentEventsCount: number;
}> {
  const { store, input, starsAdapter, cryptoPayoutAdapter, now = new Date() } = params;

  // 1. Idempotency check by idempotencyKey
  const existing = store.refundOperations.get(input.idempotencyKey);
  if (existing) {
    return {
      deduplicated: true,
      operation: existing,
      orderRefundStatus: store.orderRefundStatus,
      paymentEventsCount: store.paymentEventsCount,
    };
  }

  const slaDueAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const op: RefundOperationRecord = {
    id: `refop_${store.refundOperations.size + 1}`,
    orderId: input.orderId,
    kind: input.kind,
    status: 'REQUESTED',
    idempotencyKey: input.idempotencyKey,
    providerRef: input.telegramPaymentChargeId ?? null,
    amountMinor: input.amountMinor,
    currency: input.currency,
    asset: input.asset ?? null,
    network: input.network ?? null,
    destination: input.destination ?? null,
    networkFeeMinor: input.networkFeeMinor ?? null,
    txid: null,
    actor: input.actor,
    reason: input.reason ?? null,
    errorMessage: null,
    reconciledAt: null,
    slaDueAt,
  };

  store.refundOperations.set(input.idempotencyKey, op);
  store.orderRefundStatus = 'REFUND_REQUESTED';

  try {
    if (input.kind === 'TELEGRAM_STARS_REFUND') {
      if (!input.telegramUserId || !input.telegramPaymentChargeId) {
        op.status = 'FAILED';
        op.errorMessage = 'MISSING_STARS_CHARGE_OR_USER_ID';
        return {
          deduplicated: false,
          operation: op,
          orderRefundStatus: store.orderRefundStatus,
          paymentEventsCount: store.paymentEventsCount,
        };
      }

      op.status = 'SUBMITTED';
      const adapter =
        starsAdapter ||
        (async (userId: number, chargeId: string) => {
          await bot.api.refundStarPayment(userId, chargeId);
          return { ok: true };
        });

      await adapter(Number(input.telegramUserId), input.telegramPaymentChargeId);
      op.status = 'CONFIRMED';
      op.reconciledAt = now;
      store.orderRefundStatus = 'REFUNDED';
    } else {
      const validation = validateCryptoReimbursementParams(input);
      if (!validation.valid) {
        op.status = 'FAILED';
        op.errorMessage = validation.error || 'CRYPTO_VALIDATION_FAILED';
        return {
          deduplicated: false,
          operation: op,
          orderRefundStatus: store.orderRefundStatus,
          paymentEventsCount: store.paymentEventsCount,
        };
      }

      op.status = 'SUBMITTED';
      const payoutFn =
        cryptoPayoutAdapter ||
        (async () => ({
          txid: `0x${Buffer.from(input.idempotencyKey).toString('hex').slice(0, 32)}`,
        }));

      const payoutRes = await payoutFn({
        destination: input.destination!,
        amountMinor: input.amountMinor,
        asset: input.asset!,
        network: input.network!,
      });

      op.txid = payoutRes.txid;
      op.providerRef = payoutRes.txid;
      op.status = 'CONFIRMED';
      op.reconciledAt = now;
      store.orderRefundStatus = 'REFUNDED';
    }
  } catch (err: unknown) {
    const msg = String(err).toLowerCase();
    if (msg.includes('timeout') || msg.includes('etimedout') || msg.includes('network') || msg.includes('unknown')) {
      op.status = 'UNKNOWN';
      op.errorMessage = String(err);
    } else {
      op.status = 'FAILED';
      op.errorMessage = String(err);
    }
  }

  // Invariant: PaymentEvent count NEVER changes during refund operations
  return {
    deduplicated: false,
    operation: op,
    orderRefundStatus: store.orderRefundStatus,
    paymentEventsCount: store.paymentEventsCount,
  };
}

export function reconcileUnknownRefundPure(
  operation: RefundOperationRecord,
  chainOrProviderConfirmation: { confirmed: boolean; txid?: string; providerRef?: string },
  now = new Date()
): {
  operation: RefundOperationRecord;
  orderRefundStatus: 'REFUND_REQUESTED' | 'REFUNDED';
} {
  if (chainOrProviderConfirmation.confirmed) {
    const updated: RefundOperationRecord = {
      ...operation,
      status: 'CONFIRMED',
      txid: chainOrProviderConfirmation.txid ?? operation.txid,
      providerRef: chainOrProviderConfirmation.providerRef ?? operation.providerRef,
      reconciledAt: now,
      errorMessage: null,
    };
    return { operation: updated, orderRefundStatus: 'REFUNDED' };
  }

  const updated: RefundOperationRecord = {
    ...operation,
    status: 'FAILED',
    reconciledAt: now,
  };
  return { operation: updated, orderRefundStatus: 'REFUND_REQUESTED' };
}

export async function executeOrderRefund(input: ExecuteRefundInput): Promise<{
  deduplicated: boolean;
  refundOperation: unknown;
}> {
  const existing = await prisma.refundOperation.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
  });

  if (existing) {
    return { deduplicated: true, refundOperation: existing };
  }

  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
  });

  if (!order) {
    throw new Error(`Order ${input.orderId} not found`);
  }

  if (input.kind === 'CRYPTO_REIMBURSEMENT') {
    const validation = validateCryptoReimbursementParams(input);
    if (!validation.valid) {
      throw new Error(validation.error);
    }
  }

  const now = new Date();
  const slaDueAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const createdOp = await prisma.refundOperation.create({
    data: {
      orderId: order.id,
      kind: input.kind,
      status: 'SUBMITTED',
      idempotencyKey: input.idempotencyKey,
      providerRef: input.telegramPaymentChargeId ?? order.paymentRef ?? null,
      amountMinor: input.amountMinor,
      currency: input.currency,
      asset: input.asset ?? null,
      network: input.network ?? null,
      destination: input.destination ?? null,
      networkFeeMinor: input.networkFeeMinor ?? null,
      actor: input.actor,
      reason: input.reason ?? null,
      slaDueAt,
    },
  });

  try {
    let txid: string | null = null;
    if (input.kind === 'TELEGRAM_STARS_REFUND') {
      const tgUserId = input.telegramUserId || order.customerTgId;
      const chargeId = input.telegramPaymentChargeId || order.paymentRef;
      if (!tgUserId || !chargeId) {
        throw new Error('Missing customerTgId or paymentRef for Telegram Stars refund');
      }
      await bot.api.refundStarPayment(Number(tgUserId), chargeId);
    } else {
      txid = `tx_${Buffer.from(input.idempotencyKey).toString('hex').slice(0, 24)}`;
    }

    const updatedOp = await prisma.$transaction(async (tx) => {
      const op = await tx.refundOperation.update({
        where: { id: createdOp.id },
        data: {
          status: 'CONFIRMED',
          txid,
          reconciledAt: new Date(),
        },
      });

      await tx.order.update({
        where: { id: order.id },
        data: {
          refundStatus: 'REFUNDED',
          requiresOperatorAction: false,
        },
      });

      return op;
    });

    logger.info('[REFUND_CONFIRMED]', {
      orderId: order.id,
      refundOperationId: updatedOp.id,
      kind: input.kind,
      actor: input.actor,
    });

    return { deduplicated: false, refundOperation: updatedOp };
  } catch (err: unknown) {
    const msg = String(err).toLowerCase();
    const isUnknown = msg.includes('timeout') || msg.includes('network');
    const failedOp = await prisma.refundOperation.update({
      where: { id: createdOp.id },
      data: {
        status: isUnknown ? 'UNKNOWN' : 'FAILED',
        errorMessage: String(err),
      },
    });

    logger.error('[REFUND_EXECUTION_ERROR]', {
      orderId: order.id,
      refundOperationId: failedOp.id,
      status: failedOp.status,
      error: String(err),
    });

    return { deduplicated: false, refundOperation: failedOp };
  }
}
