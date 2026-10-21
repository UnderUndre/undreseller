import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/telemetry/logger';

export type BotProfile = 'CLIENT_BOT' | 'STAFF_BOT';

export const OUTBOX_PRIORITY = {
  CRITICAL_GDPR_AND_MARKUP: 100,
  HIGH_STAFF_PAGER: 50,
  NORMAL_NOTIFICATION: 10,
} as const;

export const BOT_GLOBAL_RPS_LIMIT = 25;
export const PRIVATE_CHAT_RPS_LIMIT = 1;
export const GROUP_CHAT_RPM_LIMIT = 20;
export const LEASE_DURATION_MS = 30 * 1000; // 30s atomic lease
export const STARVATION_AGE_STEP_MS = 15 * 1000; // +25 priority boost every 15s waiting

export type TelegramErrorCategory = 'PERMANENT_NO_OP' | 'RATE_LIMIT_429' | 'TRANSIENT_RETRY';

export interface ClassifiedTelegramError {
  category: TelegramErrorCategory;
  retryAfterSec?: number;
  reason: string;
}

export function classifyTelegramError(err: unknown): ClassifiedTelegramError {
  const errObj = err as {
    error_code?: number;
    status?: number;
    description?: string;
    message?: string;
    parameters?: { retry_after?: number };
  };

  const code = errObj?.error_code || errObj?.status;
  const retryAfter = errObj?.parameters?.retry_after;
  const msg = String(errObj?.description || errObj?.message || err || '').toLowerCase();

  if (code === 429 || retryAfter !== undefined || msg.includes('too many requests') || msg.includes('retry after')) {
    const parsedRetry =
      retryAfter ??
      (msg.match(/retry after (\d+)/i) ? parseInt(msg.match(/retry after (\d+)/i)![1], 10) : 5);
    return {
      category: 'RATE_LIMIT_429',
      retryAfterSec: Math.max(1, parsedRetry),
      reason: 'TELEGRAM_429_RATE_LIMIT',
    };
  }

  // Permanent non-retryable Telegram errors (deleted message, unchanged markup/text, blocked bot, invalid chat)
  if (
    msg.includes('message to edit not found') ||
    msg.includes('message is not modified') ||
    msg.includes("message can't be edited") ||
    msg.includes('message to delete not found') ||
    msg.includes('chat not found') ||
    msg.includes('bot was blocked by the user') ||
    msg.includes('user is deactivated') ||
    msg.includes('have no rights to send a message') ||
    msg.includes('not enough rights') ||
    code === 400 ||
    code === 403
  ) {
    return {
      category: 'PERMANENT_NO_OP',
      reason: msg || `HTTP_${code}`,
    };
  }

  return {
    category: 'TRANSIENT_RETRY',
    reason: msg || 'NETWORK_OR_5XX_ERROR',
  };
}

export interface OutboxCandidate {
  id: string;
  botProfile: BotProfile;
  chatId: string;
  priority: number;
  dedupeKey: string;
  createdAt: Date;
  nextAttemptAt: Date | null;
  attemptCount: number;
  status: 'PENDING' | 'PROCESSING' | 'SENT' | 'FAILED';
  lockedAt?: Date | null;
  lockedBy?: string | null;
  leaseExpiresAt?: Date | null;
  reconciliationState?: string | null;
  payloadJson: {
    action: 'sendMessage' | 'editMessageText' | 'editMessageReplyMarkup' | 'deleteMessage';
    chatId: string;
    messageId?: number;
    text?: string;
    replyMarkup?: unknown;
    orderId?: string;
    meta?: Record<string, unknown>;
  };
}

export function computeEffectivePriority(item: { priority: number; createdAt: Date }, now = new Date()): number {
  const ageMs = Math.max(0, now.getTime() - item.createdAt.getTime());
  const ageBoost = Math.floor(ageMs / STARVATION_AGE_STEP_MS) * 25;
  return item.priority + ageBoost;
}

export function sortOutboxWithStarvationProtection<T extends { id: string; priority: number; createdAt: Date }>(
  items: T[],
  now = new Date()
): T[] {
  return [...items].sort((a, b) => {
    const effA = computeEffectivePriority(a, now);
    const effB = computeEffectivePriority(b, now);
    if (effB !== effA) {
      return effB - effA;
    }
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
}

export interface EnqueueTelegramOutboxInput {
  botProfile: BotProfile;
  chatId: string;
  priority?: number;
  dedupeKey: string;
  action: 'sendMessage' | 'editMessageText' | 'editMessageReplyMarkup' | 'deleteMessage';
  messageId?: number;
  text?: string;
  replyMarkup?: unknown;
  orderId?: string;
}

export async function enqueueTelegramOutbox(input: EnqueueTelegramOutboxInput): Promise<{ id: string; deduplicated: boolean }> {
  const priority = input.priority ?? OUTBOX_PRIORITY.NORMAL_NOTIFICATION;
  const kind = input.botProfile === 'STAFF_BOT' ? 'STAFF_BOT_OUTBOUND' : 'TELEGRAM_OUTBOUND';

  const existing = await prisma.inboxEvent.findUnique({
    where: { dedupeKey: input.dedupeKey },
    select: { id: true },
  });

  if (existing) {
    return { id: existing.id, deduplicated: true };
  }

  try {
    const created = await prisma.inboxEvent.create({
      data: {
        provider: input.botProfile,
        eventId: input.dedupeKey,
        dedupeKey: input.dedupeKey,
        kind,
        botProfile: input.botProfile,
        chatId: String(input.chatId),
        priority,
        status: 'PENDING',
        nextAttemptAt: new Date(),
        payloadJson: {
          action: input.action,
          chatId: String(input.chatId),
          messageId: input.messageId,
          text: input.text,
          replyMarkup: input.replyMarkup ?? null,
          orderId: input.orderId,
        },
      },
      select: { id: true },
    });

    return { id: created.id, deduplicated: false };
  } catch (err: unknown) {
    if (typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === 'P2002') {
      const found = await prisma.inboxEvent.findFirst({
        where: { OR: [{ dedupeKey: input.dedupeKey }, { provider: input.botProfile, eventId: input.dedupeKey }] },
        select: { id: true },
      });
      return { id: found?.id || 'deduped', deduplicated: true };
    }
    throw err;
  }
}

export interface InMemoryDispatcherState {
  items: OutboxCandidate[];
  botCooldownUntil: Record<BotProfile, Date | null>;
  chatLastSentAt: Record<string, Date[]>;
}

export function createInMemoryDispatcherState(): InMemoryDispatcherState {
  return {
    items: [],
    botCooldownUntil: {
      CLIENT_BOT: null,
      STAFF_BOT: null,
    },
    chatLastSentAt: {},
  };
}

export async function processOutboxBatchInMemory(
  state: InMemoryDispatcherState,
  executor: (item: OutboxCandidate) => Promise<void>,
  now = new Date(),
  workerId = 'worker_1'
): Promise<{
  sent: number;
  terminalNoOp: number;
  rateLimited: number;
  reconciledLeases: number;
}> {
  let sent = 0;
  let terminalNoOp = 0;
  let rateLimited = 0;
  let reconciledLeases = 0;

  // 1. Reconcile expired leases
  for (const item of state.items) {
    if (
      item.status === 'PROCESSING' &&
      item.leaseExpiresAt &&
      item.leaseExpiresAt.getTime() <= now.getTime()
    ) {
      item.status = 'PENDING';
      item.lockedBy = null;
      item.lockedAt = null;
      item.leaseExpiresAt = null;
      item.reconciliationState = 'LEASE_RECOVERED';
      reconciledLeases++;
    }
  }

  // 2. Select eligible PENDING items
  const eligible = state.items.filter(
    (item) =>
      item.status === 'PENDING' &&
      (!item.nextAttemptAt || item.nextAttemptAt.getTime() <= now.getTime())
  );

  const ordered = sortOutboxWithStarvationProtection(eligible, now);

  for (const item of ordered) {
    // Check shared bot-wide 429 cooldown
    const cooldown = state.botCooldownUntil[item.botProfile];
    if (cooldown && cooldown.getTime() > now.getTime()) {
      item.nextAttemptAt = new Date(cooldown.getTime());
      rateLimited++;
      continue;
    }

    // Check per-chat rate shaping (~1/sec private, ~20/min group -100...)
    const chatKey = `${item.botProfile}:${item.chatId}`;
    const history = (state.chatLastSentAt[chatKey] || []).filter(
      (ts) => now.getTime() - ts.getTime() < 60 * 1000
    );
    state.chatLastSentAt[chatKey] = history;

    const isGroup = String(item.chatId).startsWith('-');
    if (isGroup && history.length >= GROUP_CHAT_RPM_LIMIT) {
      item.nextAttemptAt = new Date(now.getTime() + 3000);
      rateLimited++;
      continue;
    }

    const lastSent = history[history.length - 1];
    if (!isGroup && lastSent && now.getTime() - lastSent.getTime() < 1000) {
      // Allow CRITICAL_GDPR_AND_MARKUP to preempt if needed, or shape by 1s
      if (item.priority < OUTBOX_PRIORITY.CRITICAL_GDPR_AND_MARKUP) {
        item.nextAttemptAt = new Date(lastSent.getTime() + 1000);
        rateLimited++;
        continue;
      }
    }

    // Acquire atomic lease
    item.status = 'PROCESSING';
    item.lockedBy = workerId;
    item.lockedAt = now;
    item.leaseExpiresAt = new Date(now.getTime() + LEASE_DURATION_MS);

    try {
      await executor(item);
      item.status = 'SENT';
      item.lockedBy = null;
      item.lockedAt = null;
      item.leaseExpiresAt = null;
      item.reconciliationState = 'DELIVERED';
      state.chatLastSentAt[chatKey].push(now);
      sent++;
    } catch (err: unknown) {
      const classified = classifyTelegramError(err);
      if (classified.category === 'PERMANENT_NO_OP') {
        item.status = 'SENT';
        item.lockedBy = null;
        item.lockedAt = null;
        item.leaseExpiresAt = null;
        item.reconciliationState = 'TERMINAL_NO_OP';
        terminalNoOp++;
        logger.info('[TELEGRAM_OUTBOX_TERMINAL_NO_OP]', {
          id: item.id,
          reason: classified.reason,
        });
      } else if (classified.category === 'RATE_LIMIT_429') {
        const waitMs = (classified.retryAfterSec || 5) * 1000;
        const cooldownUntil = new Date(now.getTime() + waitMs);
        state.botCooldownUntil[item.botProfile] = cooldownUntil;
        item.status = 'PENDING';
        item.attemptCount += 1;
        item.nextAttemptAt = cooldownUntil;
        item.lockedBy = null;
        item.lockedAt = null;
        item.leaseExpiresAt = null;
        rateLimited++;
        logger.warn('[TELEGRAM_OUTBOX_429_COOLDOWN]', {
          botProfile: item.botProfile,
          retryAfterSec: classified.retryAfterSec,
        });
      } else {
        item.attemptCount += 1;
        item.lockedBy = null;
        item.lockedAt = null;
        item.leaseExpiresAt = null;
        if (item.attemptCount >= 10) {
          item.status = 'FAILED';
          item.reconciliationState = 'EXHAUSTED_RETRIES';
        } else {
          item.status = 'PENDING';
          const backoffMs = Math.min(60000, 500 * Math.pow(2, item.attemptCount));
          item.nextAttemptAt = new Date(now.getTime() + backoffMs);
        }
      }
    }
  }

  return { sent, terminalNoOp, rateLimited, reconciledLeases };
}

export function getOutboxQueueMetrics(state: InMemoryDispatcherState, now = new Date()): {
  pendingCount: number;
  processingCount: number;
  sentCount: number;
  failedCount: number;
  oldestPendingAgeMs: number;
  activeCooldowns: Record<BotProfile, boolean>;
} {
  const pending = state.items.filter((i) => i.status === 'PENDING');
  const oldestPendingAgeMs =
    pending.length === 0
      ? 0
      : Math.max(...pending.map((i) => Math.max(0, now.getTime() - i.createdAt.getTime())));

  return {
    pendingCount: pending.length,
    processingCount: state.items.filter((i) => i.status === 'PROCESSING').length,
    sentCount: state.items.filter((i) => i.status === 'SENT').length,
    failedCount: state.items.filter((i) => i.status === 'FAILED').length,
    oldestPendingAgeMs,
    activeCooldowns: {
      CLIENT_BOT: Boolean(
        state.botCooldownUntil.CLIENT_BOT && state.botCooldownUntil.CLIENT_BOT > now
      ),
      STAFF_BOT: Boolean(
        state.botCooldownUntil.STAFF_BOT && state.botCooldownUntil.STAFF_BOT > now
      ),
    },
  };
}
