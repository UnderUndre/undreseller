import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import { getBot, type BotLike, type BotName } from '@/lib/telegram/botManager'

/**
 * Outbox core (spec 004 FR-401/408, research D2): enqueue → CTE SKIP LOCKED
 * claim → dispatch via the typed bot primitives → classification. The claim
 * uses the canonical Postgres CTE (antigravity F5: `WHERE id IN (SELECT … FOR
 * UPDATE SKIP LOCKED)` raises 0A000).
 */

export type OutboxActionType = 'sendMessage' | 'editMessageText' | 'editMessageReplyMarkup'

export interface EnqueueInput {
  bot: BotName
  actionType: OutboxActionType
  toChatId: string
  text?: string
  messageId?: number
  replyMarkupJson?: Record<string, unknown> | null
  priority?: number
  aggregateType?: string
  aggregateId?: string
  metaJson?: Record<string, unknown>
}

/** Best-effort enqueue — a Telegram outage must never fail the domain flow. */
export async function enqueue(payload: Payload, input: EnqueueInput): Promise<void> {
  const db: any = payload.db
  try {
    await db.execute({
      drizzle: db.drizzle,
      sql: sql`INSERT INTO telegram_outbox
               (bot, action_type, to_chat_id, text, message_id, reply_markup_json,
                priority, status, attempts, aggregate_type, aggregate_id, meta_json, created_at, updated_at)
               VALUES (${input.bot}, ${input.actionType}, ${input.toChatId}, ${input.text ?? null},
                       ${input.messageId ?? null}, ${input.replyMarkupJson ? JSON.stringify(input.replyMarkupJson) : null},
                       ${input.priority ?? 10}, 'queued', 0, ${input.aggregateType ?? null},
                       ${input.aggregateId ?? null}, ${input.metaJson ? JSON.stringify(input.metaJson) : null},
                       now(), now())`,
    })
  } catch (err: unknown) {
    payload.logger.error({ err, message: 'telegram outbox enqueue failed (domain flow continues)' })
  }
}

export type OutboxErrorClass = 'PERMANENT_NO_OP' | 'RATE_LIMIT_429' | 'TRANSIENT'

export function classifyError(err: unknown): { cls: OutboxErrorClass; retryAfterSec?: number } {
  const raw = err instanceof Error ? err.message : String(err)
  // grammY surfaces Telegram errors as "429: Too Many Requests: retry after 7" etc.
  const retry = /retry after (\d+)/i.exec(raw)
  if (retry || /\b429\b|Too Many Requests/i.test(raw)) {
    return { cls: 'RATE_LIMIT_429', retryAfterSec: retry ? Number(retry[1]) : 5 }
  }
  if (/chat not found|bot was blocked|user is deactivated|blocked by user|chat_write_forbidden/i.test(raw)) {
    return { cls: 'PERMANENT_NO_OP' }
  }
  return { cls: 'TRANSIENT' }
}

const MAX_ATTEMPTS = 5

export interface ClaimedRow {
  id: number
  bot: BotName
  actionType: OutboxActionType
  to_chat_id: string
  text: string | null
  message_id: number | null
  reply_markup_json: string | null
  priority: number
  attempts: number
  created_at: string
}

/** Atomic batch claim — canonical CTE, safe across concurrent workers. */
export async function claimBatch(payload: Payload, batchSize = 25): Promise<ClaimedRow[]> {
  const db: any = payload.db
  const res = await db.execute({
    drizzle: db.drizzle,
    sql: sql`WITH batch AS (
               SELECT id FROM telegram_outbox
               WHERE status IN ('queued', 'sending') -- expired-lease 'sending' rows recover (kill-worker)
                 AND (available_at IS NULL OR available_at <= now())
                 AND (lease_until IS NULL OR lease_until < now())
               ORDER BY (priority + CASE WHEN created_at < now() - interval '5 minutes' THEN 10 ELSE 0 END) DESC,
                        created_at ASC
               LIMIT ${batchSize}
               FOR UPDATE SKIP LOCKED
             )
             UPDATE telegram_outbox t
             SET status = 'sending', lease_until = now() + interval '30 seconds', updated_at = now()
             FROM batch
             WHERE t.id = batch.id
             RETURNING t.id, t.bot, t.action_type, t.to_chat_id, t.text, t.message_id,
                       t.reply_markup_json, t.priority, t.attempts, t.created_at`,
  })
  // UPDATE … RETURNING does NOT preserve the CTE's ORDER BY — re-sort in JS
  // by the same starvation-boost key (review-canon: priority DESC, createdAt ASC).
  const now = Date.now()
  const rows = (res.rows ?? []) as unknown as ClaimedRow[]
  const sortKey = (r: ClaimedRow): number =>
    Number(r.priority) + (new Date(r.created_at).getTime() < now - 5 * 60 * 1000 ? 10 : 0)
  return rows.sort((a, b) => {
    const d = sortKey(b) - sortKey(a)
    if (d !== 0) return d
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  })
}

async function finish(
  payload: Payload,
  id: number,
  status: 'sent' | 'queued' | 'dead',
  extra: { sentMessageId?: number; lastError?: string; availableAt?: Date; attempts?: number },
): Promise<void> {
  const db: any = payload.db
  await db.execute({
    drizzle: db.drizzle,
    sql: sql`UPDATE telegram_outbox
             SET status = ${status},
                 lease_until = NULL,
                 sent_message_id = COALESCE(${extra.sentMessageId ?? null}, sent_message_id),
                 last_error = ${extra.lastError ?? null},
                 available_at = ${extra.availableAt ? extra.availableAt.toISOString() : null},
                 attempts = ${extra.attempts ?? sql`attempts`},
                 updated_at = now()
             WHERE id = ${id}`,
  })
}

async function audit(payload: Payload, action: string, aggregateId: string, metadata: Record<string, unknown>) {
  const db: any = payload.db
  await db.execute({
    drizzle: db.drizzle,
    sql: sql`INSERT INTO audit_events (action, actor_id, aggregate_type, aggregate_id, metadata_json, created_at, updated_at)
             VALUES (${action}, 'SYSTEM', 'TELEGRAM', ${aggregateId}, ${JSON.stringify(metadata)}::jsonb, now(), now())`,
  })
}

export interface DispatchBatchResult {
  sent: number
  retried: number
  dead: number
}

/** One dispatch tick: claim → send via typed primitives → classify. */
export async function dispatchBatch(payload: Payload, batchSize = 25): Promise<DispatchBatchResult> {
  const rows = await claimBatch(payload, batchSize)
  const out: DispatchBatchResult = { sent: 0, retried: 0, dead: 0 }

  for (const row of rows) {
    const bot: BotLike | null = getBot(row.bot as BotName)
    if (!bot) {
      // Unconfigured/degraded bot — return to queue, lease expiry re-claims later.
      await finish(payload, row.id, 'queued', {
        lastError: 'bot unavailable (no-op degradation)',
        attempts: row.attempts,
      })
      out.retried += 1
      continue
    }
    const markup = row.reply_markup_json ? (JSON.parse(row.reply_markup_json) as Record<string, unknown>) : undefined
    try {
      if (row.actionType === 'sendMessage') {
        const sent = await bot.api.sendMessage(row.to_chat_id, row.text ?? '', markup ? { reply_markup: markup } : undefined)
        await finish(payload, row.id, 'sent', { sentMessageId: sent.message_id, attempts: row.attempts + 1 })
      } else if (row.actionType === 'editMessageText') {
        await bot.api.editMessageText(row.to_chat_id, row.message_id as number, row.text ?? '', markup ? { reply_markup: markup } : undefined)
        await finish(payload, row.id, 'sent', { attempts: row.attempts + 1 })
      } else {
        await bot.api.editMessageReplyMarkup(row.to_chat_id, row.message_id as number, markup ?? null)
        await finish(payload, row.id, 'sent', { attempts: row.attempts + 1 })
      }
      out.sent += 1
    } catch (err: unknown) {
      const { cls, retryAfterSec } = classifyError(err)
      const attempts = row.attempts + 1
      if (cls === 'PERMANENT_NO_OP' || (cls === 'TRANSIENT' && attempts >= MAX_ATTEMPTS)) {
        await finish(payload, row.id, 'dead', { lastError: err instanceof Error ? err.message : String(err), attempts })
        await audit(payload, 'telegram.outbox-dead', String(row.id), { cls, actionType: row.actionType })
        out.dead += 1
      } else if (cls === 'RATE_LIMIT_429') {
        const until = new Date(Date.now() + (retryAfterSec ?? 5) * 1000)
        await finish(payload, row.id, 'queued', { lastError: 'RATE_LIMIT_429', availableAt: until, attempts })
        out.retried += 1
      } else {
        await finish(payload, row.id, 'queued', { lastError: err instanceof Error ? err.message : String(err), attempts })
        out.retried += 1
      }
    }
  }

  return out
}
