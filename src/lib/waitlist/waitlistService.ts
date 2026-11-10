import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import { isBlacklisted } from '@/lib/telegram/blacklist'
import { computeClaimToken, computeUnsubscribeToken, verifyClaimToken, verifyUnsubscribeToken } from '@/lib/waitlist/claimToken'

/**
 * Waitlist service (spec 006 rev 1.2): join (T610), slot-freed notifications
 * (T620), claim (T621 — FSM CREATE_BOOKING via bookingService), lifecycle
 * sweep (T630). All writes to `waitlist_entries` live here.
 */

export class WaitlistError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

const ACTIVE_STATUSES_SQL = "('waiting', 'notified')"
const CAP_PER_PHONE = 3
const CAMPAIGN_TTL_MIN = 30
const CAMPAIGN_CAP = 3
const MAX_HORIZON_DAYS = 60
const DEFAULT_HORIZON_DAYS = 14
const NOTIFY_BATCH = 5

export interface JoinInput {
  customerName: string
  customerPhone: string
  customerEmail: string
  serviceId: string
  resourceId: string
  expiresAt?: string
  now?: Date
}

export interface JoinResult {
  entryId: number
  expiresAt: string
}

export async function joinWaitlist(payload: Payload, input: JoinInput): Promise<JoinResult> {
  const now = input.now ?? new Date()

  if (!input.customerEmail || !input.customerEmail.includes('@')) {
    throw new WaitlistError('VALIDATION_FAILED', 400, 'customerEmail is required (email-only MVP)')
  }
  if (!input.customerName || !input.customerPhone) {
    throw new WaitlistError('VALIDATION_FAILED', 400, 'customerName and customerPhone are required')
  }

  const expiresAt = input.expiresAt
    ? new Date(input.expiresAt)
    : new Date(now.getTime() + DEFAULT_HORIZON_DAYS * 24 * 60 * 60 * 1000)
  const maxHorizon = new Date(now.getTime() + MAX_HORIZON_DAYS * 24 * 60 * 60 * 1000)
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= now.getTime() || expiresAt > maxHorizon) {
    throw new WaitlistError(
      'VALIDATION_FAILED',
      400,
      `expiresAt must satisfy now < expiresAt <= now + ${MAX_HORIZON_DAYS}d`,
    )
  }

  // Service must exist and be bookable.
  const svc = await payload.findByID({ collection: 'products', id: input.serviceId, overrideAccess: true, depth: 0 }).catch(() => null)
  const product = svc as unknown as { bookable?: boolean; deletedAt?: string | null } | null
  if (!product || product.deletedAt || product.bookable !== true) {
    throw new WaitlistError('SERVICE_NOT_BOOKABLE', 422, 'Service is not bookable')
  }
  const resource = await payload
    .findByID({ collection: 'resources', id: input.resourceId, overrideAccess: true, depth: 0 })
    .catch(() => null)
  if (!resource) {
    throw new WaitlistError('RESOURCE_NOT_FOUND', 404, 'Resource not found')
  }

  // Blacklist (review F11): blocked phone cannot join.
  if (await isBlacklisted(payload, { phone: input.customerPhone })) {
    throw new WaitlistError('BLACKLISTED', 403, 'This phone is not allowed to join the waitlist')
  }

  const db: any = payload.db
  return await db.drizzle.transaction(async (trx: any) => {
    // Race-safe cap/duplicate checks — hashtext canon (004 F6 lesson, re-check R2).
    await trx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('waitlist_join_' || ${input.customerPhone}))`)

    const cap = await trx.execute(sql`
      SELECT count(*) AS n FROM waitlist_entries
      WHERE customer_phone = ${input.customerPhone} AND status IN ${sql.raw(ACTIVE_STATUSES_SQL)}`)
    if (Number((cap.rows[0] as { n: number }).n) >= CAP_PER_PHONE) {
      throw new WaitlistError('WAITLIST_CAP_REACHED', 409, `Max ${CAP_PER_PHONE} active waitlist entries per phone`)
    }

    const dup = await trx.execute(sql`
      SELECT 1 FROM waitlist_entries
      WHERE customer_phone = ${input.customerPhone} AND service_id_id = ${input.serviceId}::numeric
        AND resource_id_id = ${input.resourceId}::numeric AND status IN ${sql.raw(ACTIVE_STATUSES_SQL)}
      LIMIT 1`)
    if (dup.rows.length > 0) {
      throw new WaitlistError('WAITLIST_DUPLICATE', 409, 'You are already on the waitlist for this service')
    }

    const inserted = await trx.execute(sql`
      INSERT INTO waitlist_entries
        (customer_name, customer_phone, customer_email, service_id_id, resource_id_id,
         expires_at, status, campaign_count, created_at, updated_at)
      VALUES (${input.customerName}, ${input.customerPhone}, ${input.customerEmail},
              ${input.serviceId}::numeric, ${input.resourceId}::numeric,
              ${expiresAt.toISOString()}, 'waiting', 0, now(), now())
      RETURNING id, expires_at`)

    const row = inserted.rows[0] as { id: number; expires_at: string }
    await trx.execute(sql`
      INSERT INTO audit_events (action, actor_id, aggregate_type, aggregate_id, metadata_json, created_at, updated_at)
      VALUES ('waitlist.join', 'CUSTOMER', 'WAITLIST', ${String(row.id)},
              ${JSON.stringify({ serviceId: input.serviceId, resourceId: input.resourceId })}::jsonb, now(), now())`)

    return { entryId: Number(row.id), expiresAt: new Date(row.expires_at).toISOString() }
  })
}

export interface FreedSlot {
  resourceId: string | number
  productId: string | number
  slotStart: Date
  slotEnd: Date
  /** Review F4/F9: auto-advance matching may exclude the entry that just failed. */
  excludeEntryId?: number
}

/** Best-effort enqueue of the matching job — never blocks the release path. */
export async function notifySlotFreed(payload: Payload, slot: FreedSlot): Promise<void> {
  if (slot.slotStart.getTime() <= Date.now()) return // past slot — 0 spam (review F8)
  try {
    await payload.jobs.queue({
      task: 'waitlist-match',
      input: {
        resourceId: String(slot.resourceId),
        productId: String(slot.productId),
        slotStart: slot.slotStart.toISOString(),
        slotEnd: slot.slotEnd.toISOString(),
        excludeEntryId: slot.excludeEntryId ?? null,
      },
    })
  } catch (err: unknown) {
    payload.logger.error({ err, message: 'waitlist-match enqueue failed (release path continues)' })
  }
}

export interface MatchResult {
  notified: number
}

/**
 * FIFO matching + atomic campaign claim-mark + emails (spec 006 US2, T620).
 * Returns how many candidates were notified.
 */
export async function matchFreedSlot(
  payload: Payload,
  input: { resourceId: string; productId: string; slotStart: string; slotEnd: string; excludeEntryId?: number | null },
): Promise<MatchResult> {
  const db: any = payload.db
  const start = new Date(input.slotStart)
  if (start.getTime() <= Date.now()) return { notified: 0 } // review F8

  const candidates = await db.execute({
    drizzle: db.drizzle,
    sql: sql`SELECT id, customer_name, customer_email, campaign_count
             FROM waitlist_entries
             WHERE resource_id_id = ${input.resourceId}::numeric
               AND service_id_id = ${input.productId}::numeric
               AND status = 'waiting'
               AND campaign_count < ${CAMPAIGN_CAP}
               AND expires_at >= ${start.toISOString()}
               AND expires_at > now()
               AND (${input.excludeEntryId ?? 0} = 0 OR id <> ${input.excludeEntryId ?? 0})
             ORDER BY created_at ASC
             LIMIT ${NOTIFY_BATCH}`,
  })

  let notified = 0
  for (const raw of (candidates.rows ?? []) as Array<{
    id: number
    customer_name: string
    customer_email: string
    campaign_count: number
  }>) {
    // Atomic campaign claim-mark: only waiting rows enter a campaign.
    const marked = await db.execute({
      drizzle: db.drizzle,
      sql: sql`UPDATE waitlist_entries
               SET status = 'notified', campaign_count = campaign_count + 1, active_campaign_at = now(),
                   notified_slot_start = ${start.toISOString()}, notified_slot_end = ${input.slotEnd},
                   updated_at = now()
               WHERE id = ${raw.id} AND status = 'waiting'
               RETURNING id, campaign_count`,
    })
    if ((marked.rows ?? []).length === 0) continue
    const campaignCount = Number((marked.rows[0] as { campaign_count: number }).campaign_count)
    const claimToken = computeClaimToken(raw.id, campaignCount, start.toISOString())
    const unsubToken = computeUnsubscribeToken(raw.id)
    try {
      await sendWaitlistEmail(payload, {
        to: raw.customer_email,
        customerName: raw.customer_name,
        entryId: raw.id,
        claimToken,
        unsubToken,
        slotStart: start,
        slotEnd: input.slotEnd ? new Date(input.slotEnd) : null,
      })
      notified += 1
    } catch (err: unknown) {
      payload.logger.error({ err, message: `waitlist email failed for entry ${raw.id}` })
    }
  }
  return { notified }
}

async function serviceNameOf(payload: Payload, productId: string): Promise<string> {
  const svc = await payload
    .findByID({ collection: 'products', id: productId, overrideAccess: true, depth: 0 })
    .catch(() => null)
  const title = (svc as unknown as { title?: string } | null)?.title
  return title?.trim() || 'Запись' // канон 005 F9 fallback
}

/** Waitlist notification email (research D5): Resend canon + salted-hash log. */
export async function sendWaitlistEmail(
  payload: Payload,
  input: {
    to: string
    customerName: string
    entryId: number
    claimToken: string
    unsubToken: string
    slotStart: Date
    slotEnd: Date | null
    productId?: string
  },
): Promise<void> {
  const { sendEmail, logDelivery } = await import('@/lib/email/resendAdapter')
  const { getServerSideURL } = await import('@/utilities/getURL')
  const host = getServerSideURL().replace(/\/$/, '')
  const serviceName = input.productId ? await serviceNameOf(payload, input.productId) : 'Запись'
  const when = input.slotStart.toLocaleString('ru-RU', { timeZone: 'UTC', hour12: false })
  const claimUrl = `${host}/book/waitlist-claim?entry=${input.entryId}&token=${input.claimToken}`
  const unsubUrl = `${host}/book/waitlist-unsubscribe?entry=${input.entryId}&token=${input.unsubToken}`
  try {
    await sendEmail(payload, {
      to: input.to,
      subject: `Освободился слот — ${serviceName}`,
      html: `<p>${escapeHtml(input.customerName)}, освободилось окно:</p>
<p><strong>${escapeHtml(serviceName)}</strong><br>${escapeHtml(when)}</p>
<p><a href="${claimUrl}">Закрепить слот за собой</a> (ссылка активна 30 минут; слот может занять другой клиент).</p>
<p style="font-size:12px;color:#888"><a href="${unsubUrl}">Отписаться от уведомлений</a></p>`,
    })
    await logDelivery(payload, { kind: 'waitlist', status: 'sent', email: input.to })
  } catch (err: unknown) {
    await logDelivery(payload, {
      kind: 'waitlist',
      status: 'failed',
      email: input.to,
      errorDetail: err instanceof Error ? err.name : 'UNKNOWN',
    })
    throw err
  }
}

/** Final "campaigns exhausted" email (spec US4, campaign cap = 3). */
export async function sendWaitlistExpiredEmail(
  payload: Payload,
  input: { to: string; customerName: string; entryId: number },
): Promise<void> {
  const { sendEmail, logDelivery } = await import('@/lib/email/resendAdapter')
  const { getServerSideURL } = await import('@/utilities/getURL')
  const host = getServerSideURL().replace(/\/$/, '')
  try {
    await sendEmail(payload, {
      to: input.to,
      subject: 'Слоты появлялись, но вы не успели забронировать',
      html: `<p>${escapeHtml(input.customerName)}, срок вашей подписки на уведомления истёк.</p>
<p>Слоты освобождались, но закрепить их не удалось. Вы всегда можете <a href="${host}/book">забронировать вручную</a>.</p>`,
    })
    await logDelivery(payload, { kind: 'waitlist', status: 'sent', email: input.to })
  } catch (err: unknown) {
    await logDelivery(payload, {
      kind: 'waitlist',
      status: 'failed',
      email: input.to,
      errorDetail: err instanceof Error ? err.name : 'UNKNOWN',
    })
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// ---------------------------------------------------------------------------
// Claim + unsubscribe (T621/T630) — domain logic shared by routes and tests
// ---------------------------------------------------------------------------

export interface ClaimWaitlistInput {
  entryId: string
  token: string
  now?: Date
  gateway?: import('@/lib/payments/stripeGateway').PaymentGateway
}

export interface ClaimWaitlistResult {
  entry: { id: number; status: string }
  booking: import('@/lib/booking/bookingService').BookingResult
}

/**
 * Claim (spec 006 US3, review F1/F4/F9): token verify (bound to
 * entry+campaign+slotStart) → CAS convert → FSM CREATE_BOOKING on the notified
 * slot (time read STRICTLY from the DB row) → co-candidates re-arm. Losers
 * (SLOT_TAKEN) re-arm honestly — auto-advance is NOT called on a taken slot.
 */
export async function claimWaitlistEntry(
  payload: Payload,
  input: ClaimWaitlistInput,
): Promise<ClaimWaitlistResult> {
  const now = input.now ?? new Date()
  const db: any = payload.db

  const entryRes = await db.execute({
    drizzle: db.drizzle,
    sql: sql`SELECT id, status, campaign_count, active_campaign_at, notified_slot_start, notified_slot_end,
                    customer_name, customer_phone, customer_email, service_id_id AS service_id, resource_id_id AS resource_id
             FROM waitlist_entries WHERE id = ${input.entryId} LIMIT 1`,
  })
  const entry = entryRes.rows?.[0] as
    | {
        id: number
        status: string
        campaign_count: number
        active_campaign_at: string | null
        notified_slot_start: string | null
        notified_slot_end: string | null
        customer_name: string
        customer_phone: string
        customer_email: string
        service_id: string | number
        resource_id: string | number
      }
    | undefined
  if (!entry) throw new WaitlistError('WAITLIST_NOT_FOUND', 404, 'Waitlist entry not found')
  if (
    entry.status !== 'notified' ||
    !entry.notified_slot_start ||
    !entry.notified_slot_end ||
    !entry.active_campaign_at
  ) {
    throw new WaitlistError('WAITLIST_TOKEN_INVALID', 403, 'No active campaign for this entry')
  }
  if (now.getTime() - new Date(entry.active_campaign_at).getTime() > CAMPAIGN_TTL_MIN * 60 * 1000) {
    throw new WaitlistError('WAITLIST_TOKEN_INVALID', 403, 'Campaign link expired (30 min)')
  }
  const slotStartIso = new Date(entry.notified_slot_start).toISOString()
  if (!verifyClaimToken(entry.id, Number(entry.campaign_count), slotStartIso, input.token)) {
    throw new WaitlistError('WAITLIST_TOKEN_INVALID', 403, 'Invalid claim token')
  }

  // CAS: only the first claim of this campaign converts the entry.
  const cas = await db.execute({
    drizzle: db.drizzle,
    sql: sql`UPDATE waitlist_entries SET status = 'converted', updated_at = now()
             WHERE id = ${entry.id} AND status = 'notified' AND campaign_count = ${Number(entry.campaign_count)}
             RETURNING id`,
  })
  if ((cas.rows ?? []).length === 0) {
    throw new WaitlistError('WAITLIST_TOKEN_INVALID', 403, 'Entry already processed')
  }

  const { createBooking } = await import('@/lib/booking/bookingService')
  try {
    const booking = await createBooking(payload, {
      productId: String(entry.service_id),
      resourceId: entry.resource_id,
      start: slotStartIso,
      customerName: entry.customer_name,
      customerPhone: entry.customer_phone,
      customerEmail: entry.customer_email,
      idempotencyKey: `waitlist-claim-${entry.id}-${entry.campaign_count}-${slotStartIso}`,
      gateway: input.gateway,
    })
    // Re-arm the co-candidates of the same campaign (they lost fairly).
    await db.execute({
      drizzle: db.drizzle,
      sql: sql`UPDATE waitlist_entries SET status = 'waiting', active_campaign_at = NULL,
               notified_slot_start = NULL, notified_slot_end = NULL, updated_at = now()
               WHERE id <> ${entry.id} AND status = 'notified'
                 AND notified_slot_start = ${entry.notified_slot_start}
                 AND resource_id_id = ${entry.resource_id}`,
    })
    await db.execute({
      drizzle: db.drizzle,
      sql: sql`INSERT INTO audit_events (action, actor_id, aggregate_type, aggregate_id, metadata_json, created_at, updated_at)
               VALUES ('waitlist.converted', 'CUSTOMER', 'WAITLIST', ${String(entry.id)},
                       ${JSON.stringify({ reservationId: booking.reservationId })}::jsonb, now(), now())`,
    })
    return { entry: { id: entry.id, status: 'converted' }, booking }
  } catch (err: unknown) {
    // Honest re-arm on any booking failure (review F4: no auto-advance on 409).
    await db
      .execute({
        drizzle: db.drizzle,
        sql: sql`UPDATE waitlist_entries SET status = 'waiting', active_campaign_at = NULL, updated_at = now()
                 WHERE id = ${entry.id} AND status = 'converted'`,
      })
      .catch(() => undefined)
    throw err
  }
}

export interface UnsubscribeResult {
  status: 'cancelled'
}

/** Unsubscribe (spec 006 FR-605, review F4): releases a notified slot back to the queue. */
export async function unsubscribeWaitlistEntry(
  payload: Payload,
  input: { entryId: string; token: string; now?: Date },
): Promise<UnsubscribeResult> {
  const db: any = payload.db
  const res = await db.execute({
    drizzle: db.drizzle,
    sql: sql`SELECT id, status, resource_id_id AS resource_id, service_id_id AS item_id, notified_slot_start, notified_slot_end
             FROM waitlist_entries WHERE id = ${input.entryId} LIMIT 1`,
  })
  const entry = res.rows?.[0] as
    | {
        id: number
        status: string
        resource_id: string | number
        item_id: string | null
        notified_slot_start: string | null
        notified_slot_end: string | null
      }
    | undefined
  if (!entry) throw new WaitlistError('WAITLIST_NOT_FOUND', 404, 'Waitlist entry not found')
  if (!verifyUnsubscribeToken(entry.id, input.token)) {
    throw new WaitlistError('WAITLIST_TOKEN_INVALID', 403, 'Invalid unsubscribe token')
  }
  if (entry.status === 'cancelled') return { status: 'cancelled' }

  await db.execute({
    drizzle: db.drizzle,
    sql: sql`UPDATE waitlist_entries SET status = 'cancelled', updated_at = now() WHERE id = ${entry.id}`,
  })
  await db.execute({
    drizzle: db.drizzle,
    sql: sql`INSERT INTO audit_events (action, actor_id, aggregate_type, aggregate_id, metadata_json, created_at, updated_at)
             VALUES ('waitlist.unsubscribed', 'CUSTOMER', 'WAITLIST', ${String(entry.id)}, '{}'::jsonb, now(), now())`,
  })

  // Review F4: unsubscribe releases the notified slot back to the queue.
  if (entry.status === 'notified' && entry.notified_slot_start) {
    const start = new Date(entry.notified_slot_start)
    if (start.getTime() > Date.now() && entry.item_id) {
      try {
        await notifySlotFreed(payload, {
          resourceId: entry.resource_id,
          productId: entry.item_id,
          slotStart: start,
          slotEnd: entry.notified_slot_end ? new Date(entry.notified_slot_end) : new Date(start.getTime() + 60 * 60 * 1000),
        })
      } catch (err: unknown) {
        payload.logger.error({ err, message: 'waitlist auto-advance failed (unsubscribe)' })
      }
    }
  }
  return { status: 'cancelled' }
}
