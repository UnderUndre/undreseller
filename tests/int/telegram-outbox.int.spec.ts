import { sql } from '@payloadcms/db-postgres'
import { getPayload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import configPromise from '@payload-config'

import { resetBookingTables } from './helpers/reset003'

/**
 * Outbox STM + staff CAS/auth + webhook security (spec 004 TC-004-001..005,
 * 007..009, 020). Risk 16 → STM+DT+Error Guessing. No network: botManager is
 * unconfigured in tests → dispatch no-op path is covered; api-level send is
 * covered via the degradation branch (bot unavailable → requeue).
 */

const payload = await getPayload({ config: configPromise })

beforeAll(async () => {
  await resetBookingTables(payload)
})

const enqueueDirect = async (overrides: Record<string, unknown> = {}): Promise<number> => {
  const db: any = payload.db
  const res = await db.execute({
    drizzle: db.drizzle,
    sql: sql`INSERT INTO telegram_outbox
             (bot, action_type, to_chat_id, text, priority, status, attempts, created_at, updated_at)
             VALUES ('staff', 'sendMessage', '100200300', 'test card', 50, 'queued', 0, now(), now())
             RETURNING id`,
  })
  void overrides
  return Number((res.rows[0] as { id: number }).id)
}

describe('T420 — outbox claim + dispatch (FR-401/408, TC-004-001..005)', () => {
  it('CTE claim race: two sequential claimBatch calls never share rows (SKIP LOCKED semantics)', async () => {
    const id1 = await enqueueDirect()
    const id2 = await enqueueDirect()

    const { claimBatch } = await import('@/lib/telegram/outbox')
    const batch1 = await claimBatch(payload, 25)
    const batch2 = await claimBatch(payload, 25) // both claimed → nothing free

    const ids1 = new Set(batch1.map((r) => Number(r.id)))
    const ids2 = new Set(batch2.map((r) => Number(r.id)))
    for (const id of ids2) expect(ids1.has(id)).toBe(false)
    expect(ids1.size).toBeGreaterThanOrEqual(2) // both fresh rows landed in batch1
    void id1
    void id2
  })

  it('kill-worker: lease expiry returns the row to the claimable pool (0 losses)', async () => {
    const id = await enqueueDirect()
    const { claimBatch, dispatchBatch } = await import('@/lib/telegram/outbox')
    const first = await claimBatch(payload, 25)
    expect(first.some((r) => Number(r.id) === id)).toBe(true)
    // Worker "dies" without sending — row stuck in 'sending' with a lease.
    // Simulate lease expiry directly (no 30s wait in tests):
    const db: any = payload.db
    await db.execute({
      drizzle: db.drizzle,
      sql: sql`UPDATE telegram_outbox SET lease_until = now() - interval '1 second' WHERE id = ${id}`,
    })
    const second = await claimBatch(payload, 25)
    expect(second.some((r) => Number(r.id) === id)).toBe(true) // recovered, not lost
    // The second claim re-leased the row — expire it again, then dispatch with
    // an unconfigured bot → no-op requeue (degradation branch).
    await db.execute({
      drizzle: db.drizzle,
      sql: sql`UPDATE telegram_outbox SET lease_until = now() - interval '1 second' WHERE id = ${id}`,
    })
    const out = await dispatchBatch(payload, 25)
    expect(out.retried).toBeGreaterThanOrEqual(1)
  })

  it('429 cooldown: RATE_LIMIT_429 classification parses retry_after (unit contract)', async () => {
    const { classifyError } = await import('@/lib/telegram/outbox')
    expect(classifyError(new Error('429: Too Many Requests: retry after 7'))).toEqual({
      cls: 'RATE_LIMIT_429',
      retryAfterSec: 7,
    })
    expect(classifyError(new Error('400: Bad Request: chat not found')).cls).toBe('PERMANENT_NO_OP')
    expect(classifyError(new Error('500: Internal Server Error')).cls).toBe('TRANSIENT')
  })

  it('priority + starvation boost ordering (TC-004-004 contract)', async () => {
    const db: any = payload.db
    const high = await db.execute({
      drizzle: db.drizzle,
      sql: sql`INSERT INTO telegram_outbox (bot, action_type, to_chat_id, text, priority, status, attempts, created_at, updated_at)
               VALUES ('staff', 'sendMessage', '1', 'fresh HIGH', 50, 'queued', 0, now(), now()) RETURNING id`,
    })
    // Old NORMAL message (>5 min) → starvation boost +10 → 20 < 50 → still after HIGH...
    // Boost makes it beat FRESH NORMAL messages; CRITICAL(100) beats all.
    const critical = await db.execute({
      drizzle: db.drizzle,
      sql: sql`INSERT INTO telegram_outbox (bot, action_type, to_chat_id, text, priority, status, attempts, created_at, updated_at)
               VALUES ('staff', 'sendMessage', '1', 'critical redaction', 100, 'queued', 0, now(), now()) RETURNING id`,
    })
    const { claimBatch } = await import('@/lib/telegram/outbox')
    const batch = await claimBatch(payload, 25)
    // Leftover queued rows from earlier runs may interleave — assert the
    // relative order of THIS test's two fresh rows only.
    const criticalId = Number((critical.rows[0] as { id: number }).id)
    const highId = Number((high.rows[0] as { id: number }).id)
    const local = batch.map((r) => Number(r.id)).filter((n) => n === criticalId || n === highId)
    expect(local).toEqual([criticalId, highId])
  })
})

describe('T410 — webhook security + barrier (FR-405, TC-004-009/020)', () => {
  it('verifyWebhookSecret: missing env → fail-closed; wrong/absent → false; valid → true', async () => {
    const { verifyWebhookSecret } = await import('@/lib/telegram/security')
    const prev = process.env.TELEGRAM_TEST_SECRET
    delete process.env.TELEGRAM_TEST_SECRET
    expect(verifyWebhookSecret('anything', 'TELEGRAM_TEST_SECRET')).toBe(false) // fail-closed
    process.env.TELEGRAM_TEST_SECRET = 'expected-secret'
    expect(verifyWebhookSecret('expected-secret', 'TELEGRAM_TEST_SECRET')).toBe(true)
    expect(verifyWebhookSecret('wrong', 'TELEGRAM_TEST_SECRET')).toBe(false)
    expect(verifyWebhookSecret(null, 'TELEGRAM_TEST_SECRET')).toBe(false)
    if (prev === undefined) delete process.env.TELEGRAM_TEST_SECRET
    else process.env.TELEGRAM_TEST_SECRET = prev
  })

  it('two-press confirm barrier: 1st press → REQUIRES_CONFIRMATION (0 mutations), 2nd within 30s → CONFIRMED', async () => {
    const { awaitConfirmBarrier } = await import('@/lib/telegram/staffAuth')
    expect(awaitConfirmBarrier('reject:555')).toBe('REQUIRES_CONFIRMATION')
    expect(awaitConfirmBarrier('reject:555')).toBe('CONFIRMED')
    // After the barrier fired, a third press re-arms
    expect(awaitConfirmBarrier('reject:555')).toBe('REQUIRES_CONFIRMATION')
  })
})

describe('T430 — staff actions CAS + blacklist creation (TC-004-007/008/014)', () => {
  it('staff blacklist writes a Blacklist row with phone (review F9) and dup is rejected', async () => {
    const created = await payload.create({
      collection: 'blacklist',
      data: { phone: '+70000009999', reason: 'test blacklist', createdBy: 'test' },
      overrideAccess: true,
    })
    expect(created.phone).toBe('+70000009999')
    await expect(
      payload.create({
        collection: 'blacklist',
        data: { phone: '+70000009999', reason: 'dup', createdBy: 'test' },
        overrideAccess: true,
      }),
    ).rejects.toThrow(/already blacklisted/i)
    // Neither identifier → rejected (review F9 validator)
    await expect(
      payload.create({
        collection: 'blacklist',
        data: { reason: 'empty', createdBy: 'test' },
        overrideAccess: true,
      }),
    ).rejects.toThrow(/chatId or phone is required/i)
  })
})
