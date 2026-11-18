import { sql } from '@payloadcms/db-postgres'
import { getPayload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import configPromise from '@payload-config'
import { resetBookingTables } from './helpers/reset003'

import { createBooking, type BookingResult } from '@/lib/booking/bookingService'
import {
  MAX_COMPOSITE_MIN,
  compositeIdempotencySeed,
  deriveComposite,
  isNeutralFreeAddOn,
  type CompositeProductRow,
} from '@/lib/booking/compositeService'
import { resolveAvailability } from '@/lib/availability/resolver'
import { formatStaffCard } from '@/lib/telegram/staffCard'
import { confirmationEmail } from '@/lib/email/templates'
import type { PaymentGateway } from '@/lib/payments/stripeGateway'

/**
 * 014-composite-booking integration matrix (T1440): TC-014-003..009 core +
 * money-canon regressions (fix AG-F2), legacy parity (AG-F5.2), free-addOn
 * neutrality (AG-F4), intent drift (AG-F7.1), idempotent replay composition
 * (AG-F7.2). Gateway is a deterministic seam (003 canon) — no network.
 */

const payload = await getPayload({ config: configPromise })
const db = () => payload.db as any

beforeAll(async () => {
  await resetBookingTables(payload)
  await payload.create({
    collection: 'resources',
    data: { name: '014 Test Master', active: true },
    overrideAccess: true,
  })
  process.env.RESEND_API_KEY = 'test-key'
})

// Unique future hour-buckets (run-safety: the test DB is not truncated between runs).
let hourCursor = 100
const futureStart = (): string => {
  hourCursor += 2
  const t = new Date(Date.now() + hourCursor * 60 * 60 * 1000)
  t.setUTCMinutes(0, 0, 0)
  return t.toISOString()
}

function fakeGateway(): PaymentGateway & { intents: { bookingId: number; amountMinor: number }[] } {
  const g = {
    intents: [] as { bookingId: number; amountMinor: number }[],
    async createPaymentIntent({ amountMinor, bookingId }: { amountMinor: number; bookingId: number }) {
      g.intents.push({ bookingId, amountMinor })
      return { id: `pi_test_${bookingId}`, clientSecret: 'cs_test_secret' }
    },
    async createRefund({ paymentIntentId }: { paymentIntentId: string }) {
      return { id: `re_${paymentIntentId}` }
    },
  }
  return g
}

let svcSeq = 0
async function createService(opts: {
  durationMin?: number
  price?: number
  mode?: 'NONE' | 'FULL_PREPAYMENT' | 'DEPOSIT'
  deposit?: number
  addOn?: boolean
}): Promise<string> {
  svcSeq += 1
  const product = await payload.create({
    collection: 'products',
    data: {
      title: `014 Svc ${svcSeq}`,
      slug: `svc-014-${Date.now()}-${svcSeq}-${Math.random().toString(36).slice(2, 8)}`,
      bookable: true,
      durationMin: opts.durationMin ?? 60,
      priceInUSD: opts.price ?? (opts.addOn ? 0 : 50),
      addOn: opts.addOn ?? false,
      paymentMode: opts.mode ?? 'NONE',
      ...(opts.mode === 'DEPOSIT' ? { depositAmount: opts.deposit ?? 10 } : {}),
      cancellationCutoffHours: 3,
      layout: [],
    },
    overrideAccess: true,
  })
  return String(product.id)
}

async function orderAmount(orderId: number): Promise<number> {
  const res = await db().execute({
    drizzle: (payload.db as unknown as { drizzle: any }).drizzle,
    sql: sql`SELECT amount FROM orders WHERE id = ${orderId}`,
  })
  return Number((res.rows?.[0] as { amount: string }).amount)
}

async function reservationRow(reservationId: number): Promise<{
  total_duration_min: number
  item_id: string
  items_json: Array<Record<string, unknown>> | null
  ai_triage_status: string
}> {
  const res = await db().execute({
    drizzle: (payload.db as unknown as { drizzle: any }).drizzle,
    sql: sql`SELECT total_duration_min, item_id, items_json, ai_triage_status FROM slot_reservations WHERE id = ${reservationId}`,
  })
  return res.rows?.[0] as never
}

const weekdayOf = (date: string): number => ((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7) + 1
const seededWindows = new Set<string>()
async function seedFullDayHours(resourceId: string, date: string): Promise<void> {
  const weekday = weekdayOf(date)
  const key = `${resourceId}:${weekday}`
  if (seededWindows.has(key)) return
  await payload.create({
    collection: 'weekly-hours',
    data: { resourceId: Number(resourceId), weekday, startMin: 0, endMin: 1440 },
    overrideAccess: true,
  })
  seededWindows.add(key)
}

// ---------------------------------------------------------------------------

describe('T1400 — composite basket derivation (PURE, FR-1402)', () => {
  const row = (over: Partial<CompositeProductRow>): CompositeProductRow => ({
    id: '1',
    title: 'S',
    durationMin: 60,
    priceInUSD: 100,
    depositAmount: 0,
    addOn: false,
    paymentMode: 'NONE',
    bufferBeforeMin: 0,
    bufferAfterMin: 0,
    outCallEnabled: false,
    ...over,
  })

  it('happy path: Σ duration, primary-first snapshot, chargeable canon (TC-014-004)', () => {
    const r = deriveComposite(['1', '2'], [
      row({ id: '1' }),
      row({ id: '2', durationMin: 15, priceInUSD: 20 }),
    ])
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.composite.totalDurationMin).toBe(75)
    expect(r.composite.primaryItemId).toBe('1')
    expect(r.composite.chargeableAmountMinor).toBe(0) // NONE basket → chargeable 0 (AG-F2)
    expect(r.composite.totalPriceMinor).toBe(12000)
    expect(r.composite.items[0].productId).toBe('1')
  })

  it('ADDON_ONLY_BASKET is a composition predicate — a 10-min addOn basket with no primary fails even though Σ ≥ 5 (fix AG-F5)', () => {
    const r = deriveComposite(['1'], [row({ id: '1', addOn: true, durationMin: 10 })])
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.code).toBe('ADDON_ONLY_BASKET')
  })

  it('free add-ons are paymentMode-neutral (fix AG-F4.1)', () => {
    const free = row({ id: '2', addOn: true, durationMin: 0, priceInUSD: 0 })
    expect(isNeutralFreeAddOn(free)).toBe(true)
    const r = deriveComposite(['1', '2'], [row({ id: '1', paymentMode: 'DEPOSIT', depositAmount: 25 }), free])
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.composite.paymentMode).toBe('DEPOSIT')
    expect(r.composite.chargeableAmountMinor).toBe(2500)
  })

  it('MIXED_PAYMENT_MODES for two non-neutral modes (TC-014-007)', () => {
    const r = deriveComposite(['1', '2'], [
      row({ id: '1', paymentMode: 'DEPOSIT', depositAmount: 25 }),
      row({ id: '2', durationMin: 15, priceInUSD: 20, paymentMode: 'NONE' }),
    ])
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.code).toBe('MIXED_PAYMENT_MODES')
  })

  it('INVALID_DEPOSIT_AMOUNT zero-guard (fix AG-F4.3)', () => {
    const r = deriveComposite(['1'], [row({ id: '1', paymentMode: 'FULL_PREPAYMENT', priceInUSD: 0 })])
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.code).toBe('INVALID_DEPOSIT_AMOUNT')
  })

  it('caps: > MAX_ITEMS and Σ > MAX_COMPOSITE_MIN (TC-014-008)', () => {
    const seven = Array.from({ length: 7 }, (_, i) => row({ id: String(i + 1), durationMin: 10 }))
    const r7 = deriveComposite(seven.map((p) => p.id), seven)
    expect(r7.ok).toBe(false)
    if (!r7.ok) expect(r7.code).toBe('COMPOSITE_TOO_LONG')
    const long = deriveComposite(['1', '2'], [row({ id: '1', durationMin: MAX_COMPOSITE_MIN }), row({ id: '2', durationMin: 5 })])
    expect(long.ok).toBe(false)
    if (!long.ok) expect(long.code).toBe('COMPOSITE_TOO_LONG')
  })

  it('idempotency seed keeps duplicates (["A","A"] ≠ ["A"])', () => {
    expect(compositeIdempotencySeed(['B', 'A'])).toBe(compositeIdempotencySeed(['A', 'B']))
    expect(compositeIdempotencySeed(['A', 'A'])).not.toBe(compositeIdempotencySeed(['A']))
  })
})

describe('T1420 — createBooking composite money path (FR-1404, fix AG-F2)', () => {
  it('NONE composite: one container, orders.amount = 0, totalPrice surfaced, snapshot primary-first (TC-014-004)', async () => {
    const a = await createService({ durationMin: 60, price: 100 })
    const b = await createService({ durationMin: 15, price: 20 })
    const res = await createBooking(payload, {
      productId: a,
      items: [a, b],
      start: futureStart(),
      customerName: 'Composite',
      customerPhone: '+70000000200',
    })
    expect(res.status).toBe('BOOKED')
    expect(res.totalDurationMin).toBe(75)
    expect(res.totalPriceInUSD).toBe(120)
    expect(res.items?.map((i) => i.productId)).toEqual([a, b])
    expect(await orderAmount(res.orderId)).toBe(0) // NONE → chargeable 0 (fix AG-F2)
    const row = await reservationRow(res.reservationId)
    expect(Number(row.total_duration_min)).toBe(75)
    expect(String(row.item_id)).toBe(a)
    expect(row.items_json?.[0]?.productId).toBe(a)
    expect(row.items_json?.length).toBe(2)
  })

  it('free addOn does not move the span (TC-014-005): 60 min container, snapshot carries the add-on', async () => {
    const a = await createService({ durationMin: 60, price: 100 })
    const addOn = await createService({ addOn: true, durationMin: 0, price: 0 })
    const res = await createBooking(payload, {
      productId: a,
      items: [a, addOn],
      start: futureStart(),
      customerName: 'AddOn',
      customerPhone: '+70000000201',
    })
    expect(res.totalDurationMin).toBe(60)
    const row = await reservationRow(res.reservationId)
    expect(Number(row.total_duration_min)).toBe(60)
    expect(row.items_json?.[1]?.addOn).toBe(true)
    expect(await orderAmount(res.orderId)).toBe(0)
  })

  it('legacy parity: items=["A"] books bit-identically to productId="A" (NFR-1406, fix AG-F5.2)', async () => {
    const a = await createService({ durationMin: 60, price: 50 })
    const viaId = (await createBooking(payload, {
      productId: a,
      start: futureStart(),
      customerName: 'Legacy',
      customerPhone: '+70000000202',
    })) as BookingResult
    const viaItems = (await createBooking(payload, {
      productId: a,
      items: [a],
      start: futureStart(),
      customerName: 'Legacy',
      customerPhone: '+70000000202',
    })) as BookingResult
    expect(viaItems.status).toBe(viaId.status)
    expect(await orderAmount(viaItems.orderId)).toBe(await orderAmount(viaId.orderId))
    expect(viaItems.items?.length).toBe(1)
  })

  it('DEPOSIT basket: PaymentIntent = Σ depositAmount, orders.amount = 3500 (TC-014-014, fix AG-F2)', async () => {
    const a = await createService({ durationMin: 60, price: 100, mode: 'DEPOSIT', deposit: 25 })
    const b = await createService({ durationMin: 15, price: 80, mode: 'DEPOSIT', deposit: 10 })
    const gw = fakeGateway()
    const res = await createBooking(payload, {
      productId: a,
      items: [a, b],
      start: futureStart(),
      customerName: 'Deposit',
      customerPhone: '+70000000203',
      customerEmail: 'deposit-basket@example.com',
      gateway: gw,
    })
    expect(gw.intents[0]?.amountMinor).toBe(3500)
    expect(await orderAmount(res.orderId)).toBe(3500)
    expect(res.totalDepositInUSD).toBe(35)
  })

  it('free addOn inside a DEPOSIT basket does NOT trigger MIXED_PAYMENT_MODES (fix AG-F4.1)', async () => {
    const a = await createService({ durationMin: 60, price: 100, mode: 'DEPOSIT', deposit: 25 })
    const free = await createService({ addOn: true, durationMin: 0, price: 0 })
    const gw = fakeGateway()
    const res = await createBooking(payload, {
      productId: a,
      items: [a, free],
      start: futureStart(),
      customerName: 'Neutral',
      customerPhone: '+70000000204',
      customerEmail: 'neutral@example.com',
      gateway: gw,
    })
    expect(gw.intents[0]?.amountMinor).toBe(2500)
    expect(res.items?.length).toBe(2)
  })

  it('basket rejects: ADDON_ONLY_BASKET / MIXED_PAYMENT_MODES / invalid primary (fail-closed, 0 rows)', async () => {
    const addOn1 = await createService({ addOn: true, durationMin: 0, price: 0 })
    const addOn2 = await createService({ addOn: true, durationMin: 0, price: 0 })
    await expect(
      createBooking(payload, {
        productId: addOn1,
        items: [addOn1, addOn2],
        start: futureStart(),
        customerName: 'AddOnOnly',
        customerPhone: '+70000000205',
      }),
    ).rejects.toMatchObject({ code: 'ADDON_ONLY_BASKET', status: 422 })

    const dep = await createService({ durationMin: 60, mode: 'DEPOSIT', deposit: 25 })
    const none = await createService({ durationMin: 15, price: 20 })
    await expect(
      createBooking(payload, {
        productId: dep,
        items: [dep, none],
        start: futureStart(),
        customerName: 'Mixed',
        customerPhone: '+70000000206',
      }),
    ).rejects.toMatchObject({ code: 'MIXED_PAYMENT_MODES', status: 422 })

    await expect(
      createBooking(payload, {
        productId: '99999999',
        items: ['99999999', '99999998'],
        start: futureStart(),
        customerName: 'Ghost',
        customerPhone: '+70000000207',
      }),
    ).rejects.toMatchObject({ code: 'COMPOSITE_INVALID', status: 422 })
  })

  it('race composite×composite on one start → exactly one winner, 409 SLOT_TAKEN (TC-014-012)', async () => {
    const a = await createService({ durationMin: 60 })
    const b = await createService({ durationMin: 15 })
    const start = futureStart()
    const attempt = (email: string) =>
      createBooking(payload, {
        productId: a,
        items: [a, b],
        start,
        customerName: 'Racer',
        customerPhone: '+70000000208',
        customerEmail: email,
      }).then(
        () => 'won' as const,
        (err: { code?: string }) => err.code ?? 'thrown',
      )
    const [r1, r2] = await Promise.all([attempt('race1@example.com'), attempt('race2@example.com')])
    const outcomes = [r1, r2].sort()
    expect(outcomes).toEqual(['SLOT_TAKEN', 'won'])
  })

  it('idempotent repeat by composition: [A,B] then [B,A] returns the SAME booking (TC-014-016, fix AG-F7.2)', async () => {
    const a = await createService({ durationMin: 60 })
    const b = await createService({ durationMin: 15 })
    const start = futureStart()
    const first = await createBooking(payload, {
      productId: a,
      items: [a, b],
      start,
      customerName: 'Idem',
      customerPhone: '+70000000209',
      customerEmail: 'idem@example.com',
    })
    const second = await createBooking(payload, {
      productId: b,
      items: [b, a],
      start,
      customerName: 'Idem',
      customerPhone: '+70000000209',
      customerEmail: 'idem@example.com',
    })
    expect(second.reservationId).toBe(first.reservationId)
    // The idempotent replay keeps the itemized composition (fix AG-F7.2).
    expect(second.items?.length).toBe(2)
    expect(second.totalDurationMin).toBe(75)
  })

  it('audit carries itemsCount (T1433), ai-triage stays skipped without an LLM (013 compat)', async () => {
    const a = await createService({ durationMin: 60 })
    const b = await createService({ durationMin: 15 })
    const res = await createBooking(payload, {
      productId: a,
      items: [a, b],
      start: futureStart(),
      customerName: 'Audit',
      customerPhone: '+70000000210',
      customerNotes: 'please be gentle',
    })
    const row = await reservationRow(res.reservationId)
    expect(row.ai_triage_status).toBe('skipped')
    const audit = await db().execute({
      drizzle: (payload.db as unknown as { drizzle: any }).drizzle,
      sql: sql`SELECT metadata_json FROM audit_events WHERE action = 'booking.create'
               AND aggregate_id = ${String(res.reservationId)} LIMIT 1`,
    })
    const meta = (audit.rows?.[0] as { metadata_json: { itemsCount?: number } }).metadata_json
    expect(meta.itemsCount).toBe(2)
  })
})

describe('T1411 — composite availability grid (FR-1403)', () => {
  it('resolveAvailability with composite override computes container-duration slots (Σ 75)', async () => {
    const a = await createService({ durationMin: 60 })
    const date = new Date(Date.now() + 96 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const resource = await payload.find({ collection: 'resources', where: { active: { equals: true } }, limit: 1, overrideAccess: true, depth: 0 })
    await seedFullDayHours(String(resource.docs[0].id), date)
    const grid = await resolveAvailability(payload, {
      productId: a,
      date,
      composite: { durationMin: 75, bufferBeforeMin: 0, bufferAfterMin: 0 },
    })
    expect(grid.ok).toBe(true)
    if (!grid.ok) return
    expect(grid.slots.length).toBeGreaterThan(0)
    const first = grid.slots[0]
    expect(new Date(first.end).getTime() - new Date(first.start).getTime()).toBe(75 * 60_000)
  })
})

describe('T1412 — intent drift → dead intent (fix AG-F7.1, TC-014-009)', () => {
  it('product duration change between phases → INTENT_DEAD + atomic dead status + audit', async () => {
    const a = await createService({ durationMin: 60 })
    const b = await createService({ durationMin: 15 })
    const date = new Date(Date.now() + 120 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const resource = await payload.find({ collection: 'resources', where: { active: { equals: true } }, limit: 1, overrideAccess: true, depth: 0 })
    await seedFullDayHours(String(resource.docs[0].id), date)
    const grid = await resolveAvailability(payload, {
      productId: a,
      date,
      composite: { durationMin: 75, bufferBeforeMin: 0, bufferAfterMin: 0 },
    })
    expect(grid.ok && grid.slots.length > 0).toBe(true)
    const start = grid.ok ? grid.slots[grid.slots.length - 1].start : ''

    // Capture the OTP code from the mocked Resend transport (007 test canon).
    let otp = ''
    const realFetch = globalThis.fetch
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const body = typeof init?.body === 'string' ? init.body : ''
      const m = body.match(/(\d{6})/)
      if (m) otp = m[1]
      return new Response(JSON.stringify({ id: 'resend_test' }), { status: 200 })
    }) as typeof fetch

    const { createIntent, verifyIntentBooking } = await import('@/lib/booking/intentService')
    let intentId = 0
    try {
      const intent = await createIntent(payload, {
        productId: a,
        items: [a, b],
        start,
        customerName: 'Drifter',
        customerPhone: '+70000000211',
        customerEmail: 'drift@example.com',
        ip: '127.0.0.99',
      })
      intentId = Number(intent.intentId)
      expect(otp).not.toBe('')

      // Drift: the primary grows by 30 min → Σ no longer matches the held slotEnd.
      await payload.update({
        collection: 'products',
        id: a,
        data: { durationMin: 90 },
        overrideAccess: true,
      })

      await expect(
        verifyIntentBooking(payload, { intentId: String(intentId), otp }),
      ).rejects.toMatchObject({ code: 'INTENT_DEAD', status: 403 })

      const rowRes = await db().execute({
        drizzle: (payload.db as unknown as { drizzle: any }).drizzle,
        sql: sql`SELECT status FROM booking_intents WHERE id = ${intentId}`,
      })
      expect((rowRes.rows?.[0] as { status: string }).status).toBe('dead')
      const audit = await db().execute({
        drizzle: (payload.db as unknown as { drizzle: any }).drizzle,
        sql: sql`SELECT 1 FROM audit_events WHERE action = 'intent.dead' AND aggregate_id = ${String(intentId)}
                 AND metadata_json->>'reason' = 'COMPOSITE_DRIFT' LIMIT 1`,
      })
      expect((audit.rows ?? []).length).toBe(1)
    } finally {
      globalThis.fetch = realFetch
    }
  })
})

describe('T1430 — itemized surfaces (FR-1405)', () => {
  it('staff card: primary line + ≤3 basket lines + «+N more», header = container duration', () => {
    const items = Array.from({ length: 6 }, (_, i) => ({ title: `Svc ${i}`, durationMin: i === 0 ? 60 : 10, addOn: i > 0 }))
    const card = formatStaffCard({
      reservationId: 1,
      scheduleVersion: 1,
      customerName: 'Ivan',
      customerPhone: '+70000000000',
      serviceName: 'Svc 0',
      durationMin: 105,
      startTime: new Date().toISOString(),
      timeZone: 'UTC',
      items,
    })
    const lines = card.split('\n')
    expect(lines[2]).toContain('Svc 0 · 105 min')
    expect(lines.filter((l) => l.includes('➕')).length).toBe(3)
    expect(card).toContain('+2 more')
  })

  it('confirmation email renders the itemized snapshot with the total (legacy rows keep the old body)', () => {
    const itemized = confirmationEmail({
      customerName: 'Ivan',
      bookingId: 1,
      startTime: new Date().toISOString(),
      serviceName: 'Svc 0',
      cancelToken: 'c',
      rescheduleToken: 'r',
      items: [
        { title: 'Sink swap', durationMin: 60, priceInUSD: 100, addOn: false },
        { title: 'Filter install', durationMin: 0, priceInUSD: 15, addOn: true },
      ],
    })
    expect(itemized.html).toContain('Sink swap')
    expect(itemized.html).toContain('Filter install')
    expect(itemized.html).toContain('$115.00')

    const legacy = confirmationEmail({
      customerName: 'Ivan',
      bookingId: 2,
      startTime: new Date().toISOString(),
      serviceName: 'Solo',
      cancelToken: 'c',
      rescheduleToken: 'r',
    })
    expect(legacy.html).not.toContain('<ul>')
  })
})
