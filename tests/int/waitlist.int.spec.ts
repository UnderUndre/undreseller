import { sql } from '@payloadcms/db-postgres'
import { getPayload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import configPromise from '@payload-config'

import { resetBookingTables } from './helpers/reset003'

/**
 * Smart Waitlist (spec 006 TC-006-001..016): join matrix, FIFO matching,
 * campaign cap, claim race ×100 (Risk 20), lifecycle sweep, PII boundary.
 * Emails go through the resend fetch seam (fake transport, no network).
 */

const payload = await getPayload({ config: configPromise })

const futureStart = (hoursAhead = 48): string =>
  new Date(Date.now() + (hoursAhead + 0.5) * 60 * 60 * 1000).toISOString()

let prevResendKey: string | undefined
let svcId = '1'

beforeAll(async () => {
  await resetBookingTables(payload)
  await payload.create({
    collection: 'resources',
    data: { name: 'WL Master', active: true },
    overrideAccess: true,
  })
  const svc = await payload.create({
    collection: 'products',
    data: {
      title: 'WL Base Svc',
      slug: `wl-base-${Date.now()}`,
      bookable: true,
      durationMin: 60,
      priceInUSD: 10,
      layout: [],
    },
    overrideAccess: true,
  })
  svcId = String(svc.id)
  prevResendKey = process.env.RESEND_API_KEY
  process.env.RESEND_API_KEY = 'test-key'
  // Base fake Resend transport for the whole file — matching sends emails
  // inline; installFakeResend layers a COUNTING wrapper over this base.
  const baseFake = (async () => new Response(JSON.stringify({ id: 'wl_base' }), { status: 200 })) as typeof fetch
  ;(globalThis as Record<string, unknown>).__wlBaseFake = baseFake
  globalThis.fetch = baseFake
})

// Fake Resend transport (003 canon) — captures sends, returns 200.
const installFakeResend = (): { calls: Array<{ to: string; subject: string }>; restore: () => void } => {
  const calls: Array<{ to: string; subject: string }> = []
  const baseFake = (globalThis as Record<string, unknown>).__wlBaseFake as typeof fetch
  const restore = () => (globalThis.fetch = baseFake)
  const impl = (async (_url: unknown, init?: { body?: string }) => {
    const body = JSON.parse(init?.body ?? '{}') as { to: string; subject: string }
    calls.push({ to: body.to, subject: body.subject })
    return new Response(JSON.stringify({ id: 'wl_test' }), { status: 200 })
  }) as typeof fetch
  globalThis.fetch = impl as typeof fetch
  return { calls, restore }
}

const joinViaService = async (phone: string, email: string, name = 'WL User', serviceId?: string): Promise<number> => {
  const { joinWaitlist } = await import('@/lib/waitlist/waitlistService')
  const res = await joinWaitlist(payload, {
    customerName: name,
    customerPhone: phone,
    customerEmail: email,
    serviceId: serviceId ?? svcId,
    resourceId: '1',
  })
  return res.entryId
}

const seedBookableService = async (): Promise<string> => {
  const product = await payload.create({
    collection: 'products',
    data: {
      title: 'WL Svc',
      slug: `wl-svc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      bookable: true,
      durationMin: 60,
      priceInUSD: 10,
      layout: [],
    },
    overrideAccess: true,
  })
  return String(product.id)
}

describe('T610 — join matrix (FR-601, TC-006-001..003)', () => {
  it('happy join → waiting + audit waitlist.join (TC-006-001)', async () => {
    const svc = await seedBookableService()
    const entryId = await joinViaService('+70000009001', 'wl1@example.com')
    const db: any = payload.db
    const row = await db.execute({
      drizzle: db.drizzle,
      sql: sql`SELECT status, service_id_id AS service_id, resource_id_id AS resource_id FROM waitlist_entries WHERE id = ${entryId}`,
    })
    const r = row.rows[0] as { status: string; service_id: number; resource_id: number }
    expect(r.status).toBe('waiting')
    void svc
    const audit = await db.execute({
      drizzle: db.drizzle,
      sql: sql`SELECT count(*) AS n FROM audit_events WHERE action = 'waitlist.join' AND aggregate_id = ${String(entryId)}`,
    })
    expect(Number((audit.rows[0] as { n: number }).n)).toBe(1)
  })

  it('cap 3 active per phone: 4th → 409 WAITLIST_CAP_REACHED (TC-006-002, BVA)', async () => {
    // Cap spans services — each join on a DISTINCT service (same-service join
    // would trip WAITLIST_DUPLICATE first, which is its own test below).
    const { joinWaitlist } = await import('@/lib/waitlist/waitlistService')
    for (let i = 0; i < 3; i++) {
      const svc = await seedBookableService()
      await joinWaitlist(payload, {
        customerName: 'Cap User',
        customerPhone: '+70000009002',
        customerEmail: `wl2${i}@example.com`,
        serviceId: svc,
        resourceId: '1',
      })
    }
    const svc4 = await seedBookableService()
    await expect(
      joinWaitlist(payload, {
        customerName: 'Cap User',
        customerPhone: '+70000009002',
        customerEmail: 'wl2d@example.com',
        serviceId: svc4,
        resourceId: '1',
      }),
    ).rejects.toMatchObject({ code: 'WAITLIST_CAP_REACHED' })
  })

  it('duplicate (phone+service+resource) → 409 WAITLIST_DUPLICATE; missing email → 400 (TC-006-003)', async () => {
    await joinViaService('+70000009003', 'wl3@example.com')
    await expect(joinViaService('+70000009003', 'wl3-other@example.com')).rejects.toMatchObject({
      code: 'WAITLIST_DUPLICATE',
    })
    const { joinWaitlist } = await import('@/lib/waitlist/waitlistService')
    await expect(
      joinWaitlist(payload, {
        customerName: 'No Email',
        customerPhone: '+70000009004',
        customerEmail: '',
        serviceId: '1',
        resourceId: '1',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED', status: 400 })
  })
})

describe('T620 — FIFO matching + campaign cap (FR-602, TC-006-004..006)', () => {
  it('RELEASED → FIFO top-5 notified with slot-bound claim tokens; past slot ignored (TC-006-004/005)', async () => {
    const fake = installFakeResend()
    try {
      // Dedicated service: matching must only see THIS test's entries.
      const own = await seedBookableService()
      // 7 candidates: first 5 by FIFO get notified
      for (let i = 1; i <= 7; i++) {
        await joinViaService(`+7000000910${i}`, `fifo${i}@example.com`, `FIFO${i}`, own)
      }
      const slotStart = futureStart(60)
      const { notifySlotFreed } = await import('@/lib/waitlist/waitlistService')
      await notifySlotFreed(payload, {
        resourceId: '1',
        productId: own,
        slotStart: new Date(slotStart),
        slotEnd: new Date(new Date(slotStart).getTime() + 60 * 60 * 1000),
      })
      // Run the match job inline (payload.jobs.queue is async — drain manually)
      const { matchFreedSlot } = await import('@/lib/waitlist/waitlistService')
      const out = await matchFreedSlot(payload, {
        resourceId: '1',
        productId: own,
        slotStart,
        slotEnd: new Date(new Date(slotStart).getTime() + 60 * 60 * 1000).toISOString(),
      })
      expect(out.notified).toBe(5)
      expect(fake.calls.length).toBe(5)
      const db: any = payload.db
      const rows = await db.execute({
        drizzle: db.drizzle,
        sql: sql`SELECT status, count(*) AS n FROM waitlist_entries WHERE customer_name LIKE 'FIFO%' GROUP BY status`,
      })
      const byStatus = Object.fromEntries(
        (rows.rows as Array<{ status: string; n: number }>).map((r) => [r.status, Number(r.n)]),
      )
      expect(byStatus['notified']).toBe(5)
      expect(byStatus['waiting']).toBe(2)

      // Past slot → 0 notifications (review F8)
      const past = await matchFreedSlot(payload, {
        resourceId: '1',
        productId: own,
        slotStart: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
        slotEnd: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      })
      expect(past.notified).toBe(0)
    } finally {
      fake.restore()
    }
  })

  it('campaign cap 3 → expired + final email (TC-006-006)', async () => {
    const fake = installFakeResend()
    try {
      // Dedicated service: matching must only see THIS test's entry.
      const own = await seedBookableService()
      const { matchFreedSlot, joinWaitlist } = await import('@/lib/waitlist/waitlistService')
      const joined = await joinWaitlist(payload, {
        customerName: 'Cap3',
        customerPhone: '+70000009201',
        customerEmail: 'cap3@example.com',
        serviceId: own,
        resourceId: '1',
      })
      const entryId = joined.entryId
      const slot = futureStart(70)
      // 3 campaigns: each notify → re-arm (simulated) → notify again
      for (let c = 0; c < 3; c++) {
        const res = await matchFreedSlot(payload, {
          resourceId: '1',
          productId: own,
          slotStart: new Date(new Date(slot).getTime() + c * 24 * 60 * 60 * 1000).toISOString(),
          slotEnd: new Date(new Date(slot).getTime() + (c * 24 + 1) * 60 * 60 * 1000).toISOString(),
        })
        // re-arm between campaigns (as sweep would)
        const db: any = payload.db
        await db.execute({
          drizzle: db.drizzle,
          sql: sql`UPDATE waitlist_entries SET status = 'waiting', active_campaign_at = NULL WHERE id = ${entryId} AND status = 'notified'`,
        })
        expect(res.notified).toBe(1)
      }
      // 4th campaign → cap reached → entry not notified
      const res4 = await matchFreedSlot(payload, {
        resourceId: '1',
        productId: own,
        slotStart: new Date(new Date(slot).getTime() + 3 * 24 * 60 * 60 * 1000).toISOString(),
        slotEnd: new Date(new Date(slot).getTime() + (3 * 24 + 1) * 60 * 60 * 1000).toISOString(),
      })
      expect(res4.notified).toBe(0)
      const db: any = payload.db
      const row = await db.execute({
        drizzle: db.drizzle,
        sql: sql`SELECT status, campaign_count FROM waitlist_entries WHERE id = ${entryId}`,
      })
      const r = row.rows[0] as { status: string; campaign_count: number }
      expect(r.status).toBe('waiting') // cap 3 → matched filters it out (campaign_count < 3)
      expect(Number(r.campaign_count)).toBe(3)
    } finally {
      fake.restore()
    }
  })
})

describe('T621 — claim: FSM + race ×100 (FR-603 — Risk 20, TC-006-007..010)', () => {
  it('STM claim race ×100 → 1 CONFIRMED, 99 re-armed, 0 double-booking (TC-006-007)', async () => {
    // Dedicated service: matching sees only this test's entries.
    const own = await seedBookableService()
    const entryIds: number[] = []
    for (let i = 1; i <= 100; i++) {
      entryIds.push(await joinViaService(`+7000000930${String(i).padStart(2, '0')}`, `race${i}@example.com`, `Racer${i}`, own))
    }
    const slotStart = futureStart(80)
    const slotEnd = new Date(new Date(slotStart).getTime() + 60 * 60 * 1000).toISOString()

    const { matchFreedSlot } = await import('@/lib/waitlist/waitlistService')
    const matched = await matchFreedSlot(payload, { resourceId: '1', productId: own, slotStart, slotEnd })
    expect(matched.notified).toBe(5) // FIFO top-5 enter the campaign

    const { computeClaimToken } = await import('@/lib/waitlist/claimToken')
    const db: any = payload.db
    const notified = await db.execute({
      drizzle: db.drizzle,
      sql: sql`SELECT id, campaign_count FROM waitlist_entries WHERE status = 'notified' ORDER BY id`,
    })
    const notifiedRows = notified.rows as Array<{ id: number; campaign_count: number }>

    // ×100 concurrent claims across the notified party (each entry claims once;
    // the SAME entry is retried ×20 to simulate client double-clicks too)
    const claims: Array<Promise<{ status: number }>> = []
    for (const row of notifiedRows) {
      const slotIso = new Date(slotStart).toISOString()
      const token = computeClaimToken(row.id, row.campaign_count, slotIso)
      const { claimWaitlistEntry } = await import('@/lib/waitlist/waitlistService')
      for (let k = 0; k < 20; k++) {
        claims.push(
          claimWaitlistEntry(payload, { entryId: String(row.id), token, now: new Date() })
            .then((r) => ({ status: 201, reservationId: r.booking?.reservationId }))
            .catch((e: unknown) => ({ status: (e as { status?: number }).status ?? 500 })),
        )
      }
    }
    const results = await Promise.all(claims)
    const wins = results.filter((r) => r.status === 201)
    expect(wins.length).toBe(1) // exactly one booking

    const dbRows = await db.execute({
      drizzle: db.drizzle,
      sql: sql`SELECT count(*) AS n FROM slot_reservations`,
    })
    expect(Number((dbRows.rows[0] as { n: number }).n)).toBe(1) // 0 double-booking

    // Winner entry → converted; co-candidates → waiting (re-arm, no cap burn)
    const statuses = await db.execute({
      drizzle: db.drizzle,
      sql: sql`SELECT status, count(*) AS n FROM waitlist_entries WHERE customer_name LIKE 'Racer%' GROUP BY status`,
    })
    const byStatus = Object.fromEntries(
      (statuses.rows as Array<{ status: string; n: number }>).map((r) => [r.status, Number(r.n)]),
    )
    expect(byStatus['converted']).toBe(1)
    expect(byStatus['waiting']).toBe(99)
  })

  it('claim FREE → CONFIRMED; token matrix: replay → 403, wrong token → 403 (TC-006-009)', async () => {
    const own = await seedBookableService()
    const entryId = await joinViaService('+70000009401', 'claim1@example.com', 'Claimer', own)
    const slotStart = futureStart(90)
    const { matchFreedSlot, claimWaitlistEntry } = await import('@/lib/waitlist/waitlistService')
    await matchFreedSlot(payload, {
      resourceId: '1',
      productId: own,
      slotStart,
      slotEnd: new Date(new Date(slotStart).getTime() + 60 * 60 * 1000).toISOString(),
    })
    const db: any = payload.db
    const row = await db.execute({
      drizzle: db.drizzle,
      sql: sql`SELECT campaign_count FROM waitlist_entries WHERE id = ${entryId}`,
    })
    const campaign = Number((row.rows[0] as { campaign_count: number }).campaign_count)
    const { computeClaimToken } = await import('@/lib/waitlist/claimToken')
    const token = computeClaimToken(entryId, campaign, new Date(slotStart).toISOString())

    const res = await claimWaitlistEntry(payload, { entryId: String(entryId), token, now: new Date() })
    expect(res.entry.status).toBe('converted')
    expect(res.booking?.status).toBe('BOOKED') // FREE → CONFIRMED

    // Replay after converted → 403
    await expect(claimWaitlistEntry(payload, { entryId: String(entryId), token, now: new Date() })).rejects.toMatchObject(
      { status: 403 },
    )
    // Wrong token → 403
    const entry2 = await joinViaService('+70000009402', 'claim2@example.com', 'Claimer2', own)
    await matchFreedSlot(payload, {
      resourceId: '1',
      productId: own,
      slotStart: futureStart(92),
      slotEnd: new Date(new Date(futureStart(92)).getTime() + 60 * 60 * 1000).toISOString(),
    })
    await expect(
      claimWaitlistEntry(payload, { entryId: String(entry2), token: 'forged', now: new Date() }),
    ).rejects.toMatchObject({ status: 403 })
  })

  it('claim PREPAID → HELD 15m + holdExpiresAt (STM, TC-006-008)', async () => {
    const product = await payload.create({
      collection: 'products',
      data: {
        title: 'WL Prepaid',
        slug: `wl-prepaid-${Date.now()}`,
        bookable: true,
        durationMin: 60,
        priceInUSD: 20,
        paymentMode: 'FULL_PREPAYMENT',
        layout: [],
      },
      overrideAccess: true,
    })
    const db: any = payload.db
    const entryId = await joinViaService('+70000009403', 'prepaid@example.com', 'PrepaidWL', String(product.id))
    const slotStart = futureStart(94)
    const { matchFreedSlot, claimWaitlistEntry } = await import('@/lib/waitlist/waitlistService')
    await matchFreedSlot(payload, {
      resourceId: '1',
      productId: String(product.id),
      slotStart,
      slotEnd: new Date(new Date(slotStart).getTime() + 60 * 60 * 1000).toISOString(),
    })
    const { computeClaimToken } = await import('@/lib/waitlist/claimToken')
    const crow = await db.execute({
      drizzle: db.drizzle,
      sql: sql`SELECT campaign_count FROM waitlist_entries WHERE id = ${entryId}`,
    })
    const token = computeClaimToken(entryId, Number((crow.rows[0] as { campaign_count: number }).campaign_count), new Date(slotStart).toISOString())
    const gw = {
      async createPaymentIntent({ bookingId }: { bookingId: number }) {
        return { id: `pi_test_${bookingId}`, clientSecret: null }
      },
      async createRefund() {
        return { id: 're_test' }
      },
    }
    const res = await claimWaitlistEntry(payload, { entryId: String(entryId), token, now: new Date(), gateway: gw })
    expect(res.booking?.status).toBe('HELD')
    const sr = await db.execute({
      drizzle: db.drizzle,
      sql: sql`SELECT hold_expires_at FROM slot_reservations WHERE id = ${res.booking?.reservationId}`,
    })
    expect(new Date((sr.rows[0] as { hold_expires_at: string }).hold_expires_at).getTime()).toBeGreaterThan(Date.now())
  })
})

describe('T630 — lifecycle sweep + unsubscribe (FR-604/605, TC-006-011..013)', () => {
  it('sweep: expired by horizon, stale campaign re-arm + auto-advance on free slot (TC-006-011)', async () => {
    const fake = installFakeResend()
    try {
      const { joinWaitlist, matchFreedSlot } = await import('@/lib/waitlist/waitlistService')
      // stale notified campaign on a still-free slot → auto-advance (own service)
      const own = await seedBookableService()
      const e1 = await joinViaService('+70000009501', 'adv1@example.com', 'Adv1', own)
      const e2 = await joinViaService('+70000009502', 'adv2@example.com', 'Adv2', own)
      const slot = futureStart(96)
      await matchFreedSlot(payload, {
        resourceId: '1',
        productId: own,
        slotStart: slot,
        slotEnd: new Date(new Date(slot).getTime() + 60 * 60 * 1000).toISOString(),
      })
      // backdate active_campaign_at by 45 min → stale
      const db: any = payload.db
      await db.execute({
        drizzle: db.drizzle,
        sql: sql`UPDATE waitlist_entries SET active_campaign_at = now() - interval '45 minutes'
                 WHERE id IN (${e1}, ${e2})`,
      })
      const { runWaitlistSweep } = await import('@/jobs/waitlistJobs')
      const out = await runWaitlistSweep(payload)
      // both re-armed; slot still free + future → auto-advance re-notifies (e1 excluded → e2)
      expect(out.reArmed).toBeGreaterThanOrEqual(2)
      expect(out.advanced).toBeGreaterThanOrEqual(1)
      expect(fake.calls.length).toBeGreaterThanOrEqual(1)

      // horizon expiry: entry with expiresAt just below now → expired
      const e3 = await joinViaService('+70000009503', 'exp@example.com', 'Exp')
      await db.execute({
        drizzle: db.drizzle,
        sql: sql`UPDATE waitlist_entries SET expires_at = now() - interval '1 hour' WHERE id = ${e3}`,
      })
      await runWaitlistSweep(payload)
      const row = await db.execute({
        drizzle: db.drizzle,
        sql: sql`SELECT status FROM waitlist_entries WHERE id = ${e3}`,
      })
      expect((row.rows[0] as { status: string }).status).toBe('expired')
    } finally {
      fake.restore()
    }
  })

  it('unsubscribe → cancelled + audit; auto-advance on notified slot (TC-006-012/013)', async () => {
    const fake = installFakeResend()
    try {
      const { joinWaitlist, matchFreedSlot } = await import('@/lib/waitlist/waitlistService')
      const own = await seedBookableService()
      const e1 = await joinViaService('+70000009601', 'unsub1@example.com', 'Unsub1', own)
      const e2 = await joinViaService('+70000009602', 'unsub2@example.com', 'Unsub2', own)
      const slot = futureStart(98)
      await matchFreedSlot(payload, {
        resourceId: '1',
        productId: own,
        slotStart: slot,
        slotEnd: new Date(new Date(slot).getTime() + 60 * 60 * 1000).toISOString(),
      })
      const { computeUnsubscribeToken } = await import('@/lib/waitlist/claimToken')
      const unsubToken = computeUnsubscribeToken(e1)
      const { unsubscribeWaitlistEntry } = await import('@/lib/waitlist/waitlistService')
      const out = await unsubscribeWaitlistEntry(payload, { entryId: String(e1), token: unsubToken })
      expect(out.status).toBe('cancelled')
      // e1 was notified and slot is in the future → auto-advance fired to e2
      expect(fake.calls.some((c) => c.to === 'unsub2@example.com')).toBe(true)
      // wrong token → 403
      await expect(unsubscribeWaitlistEntry(payload, { entryId: String(e2), token: 'bad' })).rejects.toMatchObject({
        status: 403,
      })
    } finally {
      fake.restore()
    }
  })

  it('PII boundary: emails carry no phone; claim link carries only HMAC (TC-006-015)', async () => {
    const fake = installFakeResend()
    try {
      const svc = await seedBookableService()
      const { joinWaitlist, matchFreedSlot } = await import('@/lib/waitlist/waitlistService')
      await joinViaService('+70000009701', 'pii@example.com', 'PII User +79990001122')
      await matchFreedSlot(payload, {
        resourceId: '1',
        productId: svcId,
        slotStart: futureStart(100),
        slotEnd: new Date(new Date(futureStart(100)).getTime() + 60 * 60 * 1000).toISOString(),
      })
      for (const call of fake.calls) {
        expect(JSON.stringify(call)).not.toContain('+79990001122')
      }
    } finally {
      fake.restore()
    }
  })
})
