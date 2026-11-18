import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import {
  analyzeBookingNote,
  isLocalLlmConfigured,
  LocalLlmError,
  type FetchImpl,
} from '@/lib/ai/localLlmClient'
import { sanitizeForLlm } from '@/lib/ai/sanitizePii'
import {
  routeTriageDecision,
  type AiTriageRecord,
  type TriageCurrency,
  type TriagePolicyConfig,
} from '@/lib/ai/triagePolicy'
import { enqueue } from '@/lib/telegram/outbox'
import { staffChatTargets } from '@/lib/telegram/staffAuth'

/**
 * Asynchronous Local AI Triage job (spec 013 US2/US3/US4, FR-1306):
 * - retries: 0 + deleteJobOnComplete: true (no duplicate retries on slow/offline GPU)
 * - Atomic CAS claim (`pending -> processing`) gated on active booking status
 * - Post-inference status check so cancelled (`RELEASED`) bookings never emit
 *   unredacted Telegram follow-up messages (antigravity F3)
 * - Strict fail-open to manual review
 */

export interface AiTriageJobResult {
  outcome: 'done' | 'failed' | 'skipped' | 'noop' | 'cancelled_mid_flight'
  route?: 'DELEGATE_OPERATOR' | 'ESCALATE_OWNER'
}

interface ShopAiSettings {
  aiTriageEnabled?: boolean
  aiDelegationLimit?: number
  aiDelegationCurrency?: TriageCurrency
  aiMinConfidence?: number
  ownerChatIds?: Array<{ chatId: string }>
}

async function resolveOwnerChatTargets(payload: Payload, settings: ShopAiSettings | null): Promise<string[]> {
  const l1 = (settings?.ownerChatIds ?? []).map((row) => String(row.chatId).trim()).filter(Boolean)
  if (l1.length > 0) return l1
  return (process.env.TELEGRAM_OWNER_CHAT_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

function resolvePolicy(settings: ShopAiSettings | null): TriagePolicyConfig {
  const rawLimit = Number(settings?.aiDelegationLimit ?? 1500)
  const rawConf = Number(settings?.aiMinConfidence ?? 0.8)
  const currency = settings?.aiDelegationCurrency
  return {
    delegationLimit: Number.isFinite(rawLimit) && rawLimit >= 0 ? rawLimit : 1500,
    delegationCurrency:
      currency === 'AED' || currency === 'USD' || currency === 'RUB' || currency === 'EUR' ? currency : 'AED',
    minConfidence: Number.isFinite(rawConf) && rawConf >= 0 && rawConf <= 1 ? rawConf : 0.8,
  }
}

export function formatTriageFollowUp(
  reservationId: number,
  record: AiTriageRecord,
  policy: TriagePolicyConfig,
): string {
  const safeSummary = sanitizeForLlm(record.summary).sanitized
  const safeMissing = record.missingInfo.map((item) => sanitizeForLlm(item).sanitized)
  const amountText =
    record.estimatedAmount !== null
      ? `${record.estimatedAmount}${record.currency ? ` ${record.currency}` : ''}`
      : 'unknown'
  const pct = Math.round(record.confidence * 100)

  if (record.route === 'DELEGATE_OPERATOR') {
    const lines = [
      `🟢 AI Triage · OPERATOR (≤ ${policy.delegationLimit} ${policy.delegationCurrency}) · Booking #${reservationId}`,
      `📂 ${record.category} · 💰 ${amountText} · 🎯 ${pct}%`,
      `📝 ${safeSummary}`,
    ]
    if (safeMissing.length > 0) {
      lines.push(`❓ Missing: ${safeMissing.join(', ')}`)
    }
    return lines.join('\n')
  }

  const lines = [
    `🔴 AI Triage · OWNER ESCALATION · Booking #${reservationId}`,
    `📂 ${record.category} · 💰 ${amountText} · ⚡ ${record.urgency} · 🎯 ${pct}%`,
    `📝 ${safeSummary}`,
    `📌 Reasons: ${record.reasons.join(', ')}`,
  ]
  if (safeMissing.length > 0) {
    lines.push(`❓ Missing: ${safeMissing.join(', ')}`)
  }
  return lines.join('\n')
}

export async function runAiTriageJob(
  payload: Payload,
  reservationId: number,
  opts: {
    fetchImpl?: FetchImpl
    baseUrl?: string
    model?: string
    timeoutMs?: number
    allowRemote?: boolean
  } = {},
): Promise<AiTriageJobResult> {
  const db: any = payload.db

  // Atomic CAS claim gated on active booking status (F3), with 4-minute stale processing recovery
  const claim = await db.execute({
    drizzle: db.drizzle,
    sql: sql`UPDATE slot_reservations
             SET ai_triage_status = 'processing', updated_at = now()
             WHERE id = ${reservationId}
               AND (
                 ai_triage_status = 'pending'
                 OR (ai_triage_status = 'processing' AND updated_at < now() - interval '4 minutes')
               )
               AND status IN ('HELD', 'BOOKED', 'PENDING_APPROVAL')
             RETURNING id, customer_notes, item_id`,
  })
  const claimed = claim.rows?.[0] as
    | { id: number; customer_notes: string | null; item_id: string | null }
    | undefined

  if (!claimed) {
    // If the booking became RELEASED while still pending, mark skipped without calling LLM
    await db.execute({
      drizzle: db.drizzle,
      sql: sql`UPDATE slot_reservations
               SET ai_triage_status = 'skipped', updated_at = now()
               WHERE id = ${reservationId}
                 AND ai_triage_status = 'pending'
                 AND status = 'RELEASED'`,
    })
    return { outcome: 'noop' }
  }

  const settings = (await payload
    .findGlobal({ slug: 'shop-settings', depth: 0 })
    .catch(() => null)) as ShopAiSettings | null

  const rawNote = claimed.customer_notes?.trim() ?? ''
  if (!rawNote || settings?.aiTriageEnabled === false || !isLocalLlmConfigured(opts.baseUrl)) {
    await db.execute({
      drizzle: db.drizzle,
      sql: sql`UPDATE slot_reservations
               SET ai_triage_status = 'skipped', updated_at = now()
               WHERE id = ${reservationId} AND ai_triage_status = 'processing'`,
    })
    return { outcome: 'skipped' }
  }

  const sanitized = sanitizeForLlm(rawNote)
  let serviceName: string | null = null
  if (claimed.item_id) {
    const product = (await payload
      .findByID({ collection: 'products', id: String(claimed.item_id), overrideAccess: true, depth: 0 })
      .catch(() => null)) as { title?: string } | null
    serviceName = product?.title ?? null
  }

  const startedAt = Date.now()
  try {
    const { extraction, model, latencyMs } = await analyzeBookingNote({
      sanitizedNote: sanitized.sanitized,
      serviceName,
      baseUrl: opts.baseUrl,
      model: opts.model,
      timeoutMs: opts.timeoutMs,
      allowRemote: opts.allowRemote,
      fetchImpl: opts.fetchImpl,
    })

    const policy = resolvePolicy(settings)
    const decision = routeTriageDecision(extraction, policy)
    const record: AiTriageRecord = { ...extraction, ...decision }

    // Re-check active status at write time so cancelled bookings never emit follow-ups (F3)
    const updated = await db.execute({
      drizzle: db.drizzle,
      sql: sql`UPDATE slot_reservations
               SET ai_triage_status = 'done',
                   ai_triage_json = ${JSON.stringify(record)}::jsonb,
                   updated_at = now()
               WHERE id = ${reservationId}
                 AND status IN ('HELD', 'BOOKED', 'PENDING_APPROVAL')
               RETURNING id`,
    })
    if ((updated.rows ?? []).length === 0) {
      await db.execute({
        drizzle: db.drizzle,
        sql: sql`UPDATE slot_reservations
                 SET ai_triage_status = 'skipped', updated_at = now()
                 WHERE id = ${reservationId}`,
      })
      return { outcome: 'cancelled_mid_flight' }
    }

    await db.execute({
      drizzle: db.drizzle,
      sql: sql`INSERT INTO audit_events (action, actor_id, aggregate_type, aggregate_id, metadata_json, created_at, updated_at)
               VALUES ('ai.triage.completed', 'SYSTEM:ai-triage', 'BOOKING', ${String(reservationId)},
                       ${JSON.stringify({
                         model,
                         latencyMs,
                         route: decision.route,
                         category: extraction.category,
                         confidence: extraction.confidence,
                         redactedPiiCount: sanitized.redactedCount,
                       })}::jsonb, now(), now())`,
    })

    let targets: string[]
    if (decision.route === 'ESCALATE_OWNER') {
      const ownerTargets = await resolveOwnerChatTargets(payload, settings)
      targets = ownerTargets.length > 0 ? ownerTargets : await staffChatTargets(payload)
    } else {
      targets = await staffChatTargets(payload)
    }

    const followUpText = formatTriageFollowUp(reservationId, record, policy)
    for (const chatId of new Set(targets)) {
      await enqueue(payload, {
        bot: 'staff',
        actionType: 'sendMessage',
        toChatId: chatId,
        text: followUpText,
        priority: 40,
        aggregateType: 'BOOKING',
        aggregateId: String(reservationId),
      })
    }

    return { outcome: 'done', route: decision.route }
  } catch (err: unknown) {
    const errorCode = err instanceof LocalLlmError ? err.code : 'UNKNOWN'
    const latencyMs = Date.now() - startedAt
    payload.logger.warn({ reservationId, errorCode, latencyMs }, 'ai-triage fallback')

    const failedUpdate = await db.execute({
      drizzle: db.drizzle,
      sql: sql`UPDATE slot_reservations
               SET ai_triage_status = 'failed', updated_at = now()
               WHERE id = ${reservationId}
                 AND status IN ('HELD', 'BOOKED', 'PENDING_APPROVAL')
               RETURNING id`,
    })

    const auditAction = errorCode === 'REMOTE_LLM_FORBIDDEN' ? 'ai.triage.ssrf_blocked' : 'ai.triage.fallback'
    await db.execute({
      drizzle: db.drizzle,
      sql: sql`INSERT INTO audit_events (action, actor_id, aggregate_type, aggregate_id, metadata_json, created_at, updated_at)
               VALUES (${auditAction}, 'SYSTEM:ai-triage', 'BOOKING', ${String(reservationId)},
                       ${JSON.stringify({
                         errorCode,
                         latencyMs,
                         redactedPiiCount: sanitized.redactedCount,
                       })}::jsonb, now(), now())`,
    })

    if ((failedUpdate.rows ?? []).length > 0) {
      const targets = await staffChatTargets(payload)
      for (const chatId of new Set(targets)) {
        await enqueue(payload, {
          bot: 'staff',
          actionType: 'sendMessage',
          toChatId: chatId,
          text: `⚠️ AI Triage unavailable for Booking #${reservationId} — manual review required`,
          priority: 40,
          aggregateType: 'BOOKING',
          aggregateId: String(reservationId),
        })
      }
    }

    return { outcome: 'failed' }
  }
}

export const aiTriageTask = {
  slug: 'ai-triage',
  label: 'Async local LLM triage for customer booking notes (spec 013 FR-1306)',
  retries: 0,
  deleteJobOnComplete: true,
  handler: async ({ req, input }: { req: { payload: Payload }; input: unknown }) => {
    const reservationId = Number((input as { reservationId?: unknown } | null)?.reservationId)
    if (!Number.isInteger(reservationId) || reservationId <= 0) {
      return { output: { outcome: 'noop' }, state: 'succeeded' as const }
    }
    const result = await runAiTriageJob(req.payload, reservationId)
    return { output: result, state: 'succeeded' as const }
  },
}
