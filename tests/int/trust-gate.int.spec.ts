import { sql } from '@payloadcms/db-postgres'
import { getPayload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import configPromise from '@payload-config'

import { resetBookingTables } from './helpers/reset003'

/**
 * Trust Gate (spec 007 TCs): BookingIntent matrix + OTP HMAC context binding,
 * brute-force guard (SC-001), two-phase verify STM (Risk 20), honeypot
 * (SC-002), waitlist double-opt-in relay-guard (SC-003), trust cookie (F1),
 * sweep + purge lifecycle (F7/F10). Emails go through the fake Resend
 * transport (006 canon) — the plaintext OTP code exists only in the captured
 * email body, never in the DB.
 */

const payload = await getPayload({ config: configPromise })

beforeAll(async () => {
  await resetBookingTables(payload)
  // Grid determinism for THIS file: stale weekly-hours/exceptions from earlier
  // files would point at foreign resources with arbitrary windows.
  const db0: any = payload.db
  await db0.execute({
    drizzle: db0.drizzle,
    sql: sql`TRUNCATE TABLE weekly_hours, availability_exceptions RESTART IDENTITY CASCADE`,
  })
  await payload.create({
    collection: 'resources',
    data: { name: 'TG Master', active: true },
    overrideAccess: true,
  })
  process.env.RESEND_API_KEY = 'test-key'
  const baseFake = (async () => new Response(JSON.stringify({ id: 'tg_base' }), { status: 200 })) as typeof fetch
  ;(globalThis as Record<string, unknown>).__tgBaseFake = baseFake
  globalThis.fetch = baseFake
})

// Fake Resend transport (003 canon) — captures sends, returns 200.
const installFakeResend = (): {
  calls: Array<{ to: string; subject: string; body: string }>
  restore: () => void
} => {
  const calls: Array<{ to: string; subject: string; body: string }> = []
  const baseFake = (globalThis as Record<string, unknown>).__tgBaseFake as typeof fetch
  const restore = () => (globalThis.fetch = baseFake)
  const impl = (async (_url: unknown, init?: { body?: string }) => {
    calls.push({ to: '', subject: '', body: init?.body ?? '' })
    const parsed = JSON.parse(init?.body ?? '{}') as { to: string; subject: string }
    calls[calls.length - 1] = { to: parsed.to, subject: parsed.subject, body: init?.body ?? '' }
    return new Response(JSON.stringify({ id: 'tg_test' }), { status: 200 })
  }) as typeof fetch
  globalThis.fetch = impl as typeof fetch
  return { calls, restore }
}

const extractCode = (body: string): string => {
  const m = body.match(/<strong>(\d{6})<\/strong>/)
  if (!m) throw new Error('no OTP code in email body')
  return m[1]
}

let resourceSeq = 0
const seedService = async (title = 'TG Svc'): Promise<string> => {
  const product = await payload.create({
    collection: 'products',
    data: {
      title,
      slug: `tg-svc-${Date.now()}-${resourceSeq++}-${Math.random().toString(36).slice(2, 8)}`,
      bookable: true,
      durationMin: 60,
      priceInUSD: 10,
      layout: [],
    },
    overrideAccess: true,
  })
  return String(product.id)
}

const seededWindows = new Set<string>()
const seedWeeklyHours = async (resourceId: string, date: string): Promise<void> => {
  const weekday = ((new Date(date + 'T00:00:00Z').getUTCDay() + 6) % 7) + 1
  const key = `${resourceId}:${weekday}`
  if (seededWindows.has(key)) return
  await payload.create({
    collection: 'weekly-hours',
    data: { resourceId: Number(resourceId), weekday, startMin: 0, endMin: 1440 },
    overrideAccess: true,
  })
  seededWindows.add(key)
}

/** First computed slot for the service ~hoursAhead ahead (grid canon: taken from resolveAvailability itself). */
const gridStart = async (svcId: string, hoursAhead = 48): Promise<string> => {
  const { resolveAvailability } = await import('@/lib/availability/resolver')
  for (let attempt = 0; attempt < 3; attempt++) {
    const date = new Date(Date.now() + (hoursAhead + attempt * 24) * 60 * 60 * 1000).toISOString().slice(0, 10)
    await seedWeeklyHours('1', date)
    const r = await resolveAvailability(payload, { productId: svcId, date })
    if (r.ok && r.slots.length > 0) return r.slots[0].start
  }
  throw new Error('no computed slots available for the grid test')
}

const db = () => (payload.db as any)

const intentRow = async (id: number) => {
  const res = await db().execute({
    drizzle: (payload.db as unknown as { drizzle: any }).drizzle,
    sql: sql`SELECT id, email, customer_name, status, attempts, code_hash, expires_at FROM booking_intents WHERE id = ${id}`,
  })
  return res.rows?.[0] as { id: number; email: string; customer_name: string; status: string; attempts: number; code_hash: string; expires_at: string } | undefined
}

// ---------------------------------------------------------------------------
// T710/T711 — createIntent matrix + OTP email (FR-701)
// ---------------------------------------------------------------------------

describe('T710 — intent creation matrix (FR-701)', () => {
  it('happy intent: pending + context-bound HMAC + OTP email + audit + delivery log (PII)', async () => {
    const fake = installFakeResend()
    try {
      const svc = await seedService()
      const start = await gridStart(svc)
      const { createIntent } = await import('@/lib/booking/intentService')
      const out = await createIntent(payload, {
        productId: svc,
        start,
        customerName: 'TG User',
        customerPhone: '+70000008101',
        customerEmail: 'tg1@example.com',
        ip: '10.0.0.1',
      })
      expect(out.emailSent).toBe(true)
      expect(out.expiresAt > new Date().toISOString()).toBe(true)

      const row = await intentRow(out.intentId)
      expect(row?.status).toBe('pending')
      expect(Number(row?.attempts)).toBe(0)

      const code = extractCode(fake.calls[0].body)
      expect(code).toMatch(/^\d{6}$/)
      // F6 context binding: the digest verifies ONLY for (intentId, email, code).
      const { computeOtpHash, verifyOtpCode } = await import('@/lib/booking/otp')
      expect(verifyOtpCode(out.intentId, 'tg1@example.com', code, row!.code_hash)).toBe(true)
      expect(computeOtpHash(out.intentId + 999999, 'tg1@example.com', code)).not.toBe(row!.code_hash)
      expect(computeOtpHash(out.intentId, 'other@example.com', code)).not.toBe(row!.code_hash)
      // Plaintext code never stored (audit C1).
      expect(row!.code_hash).not.toContain(code)

      const audit = await db().execute({
        drizzle: db().drizzle,
        sql: sql`SELECT count(*) AS n FROM audit_events WHERE action = 'intent.created' AND aggregate_id = ${String(out.intentId)}`,
      })
      expect(Number((audit.rows[0] as { n: number }).n)).toBe(1)

      const log = await db().execute({
        drizzle: db().drizzle,
        sql: sql`SELECT kind, status, recipient_hash FROM email_delivery_log WHERE kind = 'intent' ORDER BY id DESC LIMIT 1`,
      })
      const l = log.rows[0] as { kind: string; status: string; recipient_hash: string }
      expect(l.status).toBe('sent')
      expect(l.recipient_hash).not.toContain('tg1@example.com') // PII canon INV-010
      expect(fake.calls[0].body).not.toContain('+70000008101') // no phone in email
    } finally {
      fake.restore()
    }
  })

  it('past slot → 422 SLOT_IN_PAST; junk time (off-grid) → 422 SLOT_NOT_AVAILABLE', async () => {
    const svc = await seedService()
    const { createIntent } = await import('@/lib/booking/intentService')
    await expect(
      createIntent(payload, {
        productId: svc,
        start: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        customerName: 'Past',
        customerPhone: '+70000008102',
        customerEmail: 'tg-past@example.com',
        ip: '10.0.0.2',
      }),
    ).rejects.toMatchObject({ code: 'SLOT_IN_PAST', status: 422 })

    // +48h + 7 minutes — off the 30-min quantum grid.
    const offGrid = new Date(Date.now() + 48 * 60 * 60 * 1000 + 7 * 60 * 1000).toISOString()
    await expect(
      createIntent(payload, {
        productId: svc,
        start: offGrid,
        customerName: 'Junk',
        customerPhone: '+70000008103',
        customerEmail: 'tg-junk@example.com',
        ip: '10.0.0.3',
      }),
    ).rejects.toMatchObject({ code: 'SLOT_NOT_AVAILABLE', status: 422 })
  })

  it('live cap ≤ 2 per email: 3rd pending → 429 INTENT_CAP (BVA)', async () => {
    const svc = await seedService()
    const { createIntent } = await import('@/lib/booking/intentService')
    for (let i = 0; i < 2; i++) {
      const start = await gridStart(svc, 48 + i * 30)
      await createIntent(payload, {
        productId: svc,
        start,
        customerName: 'Cap',
        customerPhone: '+70000008104',
        customerEmail: 'tg-cap@example.com',
        ip: '10.0.0.4',
      })
    }
    const third = await gridStart(svc, 52)
    await expect(
      createIntent(payload, {
        productId: svc,
        start: third,
        customerName: 'Cap',
        customerPhone: '+70000008104',
        customerEmail: 'tg-cap@example.com',
        ip: '10.0.0.5',
      }),
    ).rejects.toMatchObject({ code: 'INTENT_CAP', status: 429 })
  })

  it('blacklisted phone → 403 BLACKLISTED', async () => {
    await payload.create({
      collection: 'blacklist',
      data: { phone: '+70000008105', reason: 'spam', createdBy: 'test' },
      overrideAccess: true,
    })
    const svc = await seedService()
    const { createIntent } = await import('@/lib/booking/intentService')
    await expect(
      createIntent(payload, {
        productId: svc,
        start: await gridStart(svc, 48),
        customerName: 'Blocked',
        customerPhone: '+70000008105',
        customerEmail: 'tg-blocked@example.com',
        ip: '10.0.0.6',
      }),
    ).rejects.toMatchObject({ code: 'BLACKLISTED', status: 403 })
  })

  it('composite RL (F3): per-email bucket 3/10min independent of IP; per-IP 10/10min independent of email', async () => {
    const svc = await seedService()
    const { createIntent } = await import('@/lib/booking/intentService')
    const start = await gridStart(svc, 48)

    // Per-email: 3 creates on 3 DISTINCT IPs pass the email bucket; the 4th
    // (still distinct IP) is denied by the EMAIL bucket.
    for (let i = 0; i < 3; i++) {
      await createIntent(payload, {
        productId: svc,
        start: await gridStart(svc, 48 + i * 6),
        customerName: 'RLEmail',
        customerPhone: '+70000008106',
        customerEmail: 'tg-rl-email@example.com',
        ip: `10.1.1.${i + 1}`,
      }).catch((e: { code?: string }) => {
        // live-cap (2) trips first on the 3rd — the bucket is already counted.
        if (e.code !== 'INTENT_CAP') throw e
      })
    }
    await expect(
      createIntent(payload, {
        productId: svc,
        start,
        customerName: 'RLEmail',
        customerPhone: '+70000008106',
        customerEmail: 'tg-rl-email@example.com',
        ip: '10.1.1.99',
      }),
    ).rejects.toMatchObject({ code: 'RATE_LIMITED', status: 429 })

    // Per-IP: 10 fresh emails on ONE IP; the 11th is denied by the IP bucket.
    for (let i = 0; i < 10; i++) {
      await createIntent(payload, {
        productId: svc,
        start: await gridStart(svc, 49 + i * 3),
        customerName: 'RLIP',
        customerPhone: `+700000082${String(i).padStart(2, '0')}`,
        customerEmail: `tg-rl-ip${i}@example.com`,
        ip: '10.2.2.2',
      }).catch((e: { code?: string }) => {
        if (e.code !== 'INTENT_CAP') throw e // cap 2/email may trip before the IP bucket
      })
    }
    await expect(
      createIntent(payload, {
        productId: svc,
        start,
        customerName: 'RLIP',
        customerPhone: '+70000008300',
        customerEmail: 'tg-rl-ip-over@example.com',
        ip: '10.2.2.2',
      }),
    ).rejects.toMatchObject({ code: 'RATE_LIMITED', status: 429 })
  })
})

// ---------------------------------------------------------------------------
// T720 — phase 2 verify + brute-force + STM (Risk 20)
// ---------------------------------------------------------------------------

const makePendingIntent = async (email: string, phone: string, svcId?: string) => {
  const fake = installFakeResend()
  let code = ''
  let intentId = 0
  try {
    const svc = svcId ?? (await seedService())
    const { createIntent } = await import('@/lib/booking/intentService')
    const out = await createIntent(payload, {
      productId: svc,
      start: await gridStart(svc, 48),
      customerName: 'Verify User',
      customerPhone: phone,
      customerEmail: email,
      ip: `10.5.${Math.floor(Math.random() * 200)}.${Math.floor(Math.random() * 200)}`,
    })
    intentId = out.intentId
    code = extractCode(fake.calls[0].body)
  } finally {
    fake.restore()
  }
  return { intentId, code }
}

describe('T720 — verify matrix + brute-force guard (FR-702, SC-001)', () => {
  it('happy verify → BOOKED, hydrate from DB intent (F5), CAS consumed after success (F4)', async () => {
    const { intentId, code } = await makePendingIntent('tg-verify1@example.com', '+70000008401')
    const { verifyIntentBooking } = await import('@/lib/booking/intentService')
    const out = await verifyIntentBooking(payload, { intentId: String(intentId), otp: code })
    expect(out.replayed).toBe(false)
    expect(out.booking.status).toBe('BOOKED') // FREE → CONFIRMED
    expect(out.email).toBe('tg-verify1@example.com')

    const row = await intentRow(intentId)
    expect(row?.status).toBe('consumed')

    // F5 in practice: the reservation carries the intent's customer data.
    const res = await db().execute({
      drizzle: db().drizzle,
      sql: sql`SELECT customer_name, customer_phone, idempotency_key FROM slot_reservations WHERE idempotency_key = ${`booking-intent-${intentId}`}`,
    })
    const booking = res.rows[0] as { customer_name: string; customer_phone: string; idempotency_key: string }
    expect(booking.customer_name).toBe('Verify User')
    expect(booking.customer_phone).toBe('+70000008401')

    const audit = await db().execute({
      drizzle: db().drizzle,
      sql: sql`SELECT count(*) AS n FROM audit_events WHERE action = 'intent.consumed' AND aggregate_id = ${String(intentId)}`,
    })
    expect(Number((audit.rows[0] as { n: number }).n)).toBe(1)
  })

  it('brute-force: 5 wrong codes → dead; even the REAL code then fails (SC-001)', async () => {
    const { intentId, code } = await makePendingIntent('tg-brute@example.com', '+70000008402')
    const { verifyIntentBooking } = await import('@/lib/booking/intentService')
    const wrongCode = (n: number): string => String((Number(code) + n) % 1_000_000).padStart(6, '0')
    for (let i = 1; i <= 4; i++) {
      await expect(
        verifyIntentBooking(payload, { intentId: String(intentId), otp: wrongCode(i) }),
      ).rejects.toMatchObject({ code: 'OTP_INVALID', status: 403 })
    }
    // 5th wrong attempt → dead (the response is still OTP_INVALID).
    await expect(
      verifyIntentBooking(payload, { intentId: String(intentId), otp: wrongCode(5) }),
    ).rejects.toMatchObject({ code: 'OTP_INVALID', status: 403 })
    const row = await intentRow(intentId)
    expect(row?.status).toBe('dead')
    expect(Number(row?.attempts)).toBe(5)
    // The REAL code no longer passes — the gate is closed.
    await expect(
      verifyIntentBooking(payload, { intentId: String(intentId), otp: code }),
    ).rejects.toMatchObject({ code: 'INTENT_DEAD', status: 403 })
  })

  it('expired intent (TTL) → 403 INTENT_DEAD (DT TTL-матрица)', async () => {
    const { intentId } = await makePendingIntent('tg-expired@example.com', '+70000008403')
    await db().execute({
      drizzle: db().drizzle,
      sql: sql`UPDATE booking_intents SET expires_at = now() - interval '1 minute' WHERE id = ${intentId}`,
    })
    const { verifyIntentBooking } = await import('@/lib/booking/intentService')
    await expect(
      verifyIntentBooking(payload, { intentId: String(intentId), otp: '123456' }),
    ).rejects.toMatchObject({ code: 'INTENT_DEAD', status: 403 })
  })

  it('replay of consumed intent: correct code → same booking (F4); wrong code → OTP_INVALID, no token leak', async () => {
    const { intentId, code } = await makePendingIntent('tg-replay@example.com', '+70000008404')
    const { verifyIntentBooking } = await import('@/lib/booking/intentService')
    const first = await verifyIntentBooking(payload, { intentId: String(intentId), otp: code })
    const second = await verifyIntentBooking(payload, { intentId: String(intentId), otp: code })
    expect(second.replayed).toBe(true)
    expect(second.booking.reservationId).toBe(first.booking.reservationId)

    await expect(
      verifyIntentBooking(payload, { intentId: String(intentId), otp: '554433' }),
    ).rejects.toMatchObject({ code: 'OTP_INVALID', status: 403 })

    const count = await db().execute({
      drizzle: db().drizzle,
      sql: sql`SELECT count(*) AS n FROM slot_reservations WHERE idempotency_key = ${`booking-intent-${intentId}`}`,
    })
    expect(Number((count.rows[0] as { n: number }).n)).toBe(1)
  })

  it('slot taken during verification → 409 SLOT_TAKEN + intent dead (never re-armed)', async () => {
    const svc = await seedService()
    // Both intents land on the SAME grid slot (gridStart is deterministic per
    // svc + hoursAhead) — a books it, b must honestly lose it.
    const a = await makePendingIntent('tg-slot-a@example.com', '+70000008405', svc)
    const b = await makePendingIntent('tg-slot-b@example.com', '+70000008406', svc)
    const { verifyIntentBooking } = await import('@/lib/booking/intentService')
    await verifyIntentBooking(payload, { intentId: String(a.intentId), otp: a.code })
    await expect(
      verifyIntentBooking(payload, { intentId: String(b.intentId), otp: b.code }),
    ).rejects.toMatchObject({ code: 'SLOT_TAKEN', status: 409 })
    const row = await intentRow(b.intentId)
    expect(row?.status).toBe('dead')
  })
})

describe('T720 — STM: concurrent verify of ONE intent (Risk 20)', () => {
  it('×20 concurrent verify → exactly 1 booking, all callers hold the same reservation', async () => {
    const { intentId, code } = await makePendingIntent('tg-stm@example.com', '+70000008407')
    const { verifyIntentBooking } = await import('@/lib/booking/intentService')
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        verifyIntentBooking(payload, { intentId: String(intentId), otp: code })
          .then((r) => ({ ok: true as const, id: r.booking.reservationId, replayed: r.replayed }))
          .catch((e: unknown) => ({ ok: false as const, code: (e as { code?: string }).code })),
      ),
    )
    const ok = results.filter((r) => r.ok)
    expect(ok.length).toBe(20) // everyone gets the SAME idempotent booking
    expect(new Set(ok.map((r) => (r as { id: number }).id)).size).toBe(1)
    const winner = results.find((r) => r.ok && (r as { replayed: boolean }).replayed === false)
    expect(winner).toBeDefined()

    const count = await db().execute({
      drizzle: db().drizzle,
      sql: sql`SELECT count(*) AS n FROM slot_reservations WHERE idempotency_key = ${`booking-intent-${intentId}`}`,
    })
    expect(Number((count.rows[0] as { n: number }).n)).toBe(1) // 0 double-booking
    const row = await intentRow(intentId)
    expect(row?.status).toBe('consumed')
  })

  it('concurrent verify of the SAME slot via two DIFFERENT intents → 1 booking + 409 dead for the loser', async () => {
    const svc = await seedService()
    const start = await gridStart(svc, 60)
    const a = await makePendingIntent('tg-stm2-a@example.com', '+70000008408', svc)
    const b = await makePendingIntent('tg-stm2-b@example.com', '+70000008409', svc)
    await db().execute({
      drizzle: db().drizzle,
      sql: sql`UPDATE booking_intents SET slot_start = ${start} WHERE id IN (${a.intentId}, ${b.intentId})`,
    })
    const { verifyIntentBooking } = await import('@/lib/booking/intentService')
    const [ra, rb] = await Promise.allSettled([
      verifyIntentBooking(payload, { intentId: String(a.intentId), otp: a.code }),
      verifyIntentBooking(payload, { intentId: String(b.intentId), otp: b.code }),
    ])
    const fulfilled = [ra, rb].filter((r) => r.status === 'fulfilled')
    const rejected = [ra, rb].filter((r) => r.status === 'rejected')
    expect(fulfilled.length).toBe(1)
    expect(rejected.length).toBe(1)
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({ code: 'SLOT_TAKEN' })
    const count = await db().execute({
      drizzle: db().drizzle,
      sql: sql`SELECT count(*) AS n FROM slot_reservations WHERE idempotency_key LIKE 'booking-intent-%' AND start_time = ${start}`,
    })
    expect(Number((count.rows[0] as { n: number }).n)).toBe(1)
  })
})

describe('T720 — resend contract (review F2)', () => {
  it('resend rotates the code on the SAME intent: old → OTP_INVALID, new → booking; 4th resend in 10min → RATE_LIMITED', async () => {
    const fake = installFakeResend()
    try {
      const svc = await seedService()
      const { createIntent, resendIntent, verifyIntentBooking } = await import('@/lib/booking/intentService')
      const out = await createIntent(payload, {
        productId: svc,
        start: await gridStart(svc, 48),
        customerName: 'Resend User',
        customerPhone: '+70000008410',
        customerEmail: 'tg-resend@example.com',
        ip: '10.6.0.1',
      })
      const oldCode = extractCode(fake.calls[0].body)
      const oldExpires = new Date((await intentRow(out.intentId))!.expires_at).getTime()

      const r1 = await resendIntent(payload, { intentId: String(out.intentId) })
      expect(r1.intentId).toBe(out.intentId) // no duplicates — same intent
      const code2 = extractCode(fake.calls[1].body)
      expect(code2).not.toBe(oldCode)
      expect(new Date(r1.expiresAt).getTime()).toBeGreaterThan(oldExpires)

      await expect(
        verifyIntentBooking(payload, { intentId: String(out.intentId), otp: oldCode }),
      ).rejects.toMatchObject({ code: 'OTP_INVALID' })
      await resendIntent(payload, { intentId: String(out.intentId) })
      const code3 = extractCode(fake.calls[2].body)
      await resendIntent(payload, { intentId: String(out.intentId) })
      const code4 = extractCode(fake.calls[3].body)
      expect(new Set([oldCode, code2, code3, code4]).size).toBe(4) // every resend rotates
      // 4th resend within the window → capped.
      await expect(
        resendIntent(payload, { intentId: String(out.intentId) }),
      ).rejects.toMatchObject({ code: 'RATE_LIMITED', status: 429 })

      const done = await verifyIntentBooking(payload, { intentId: String(out.intentId), otp: code4 })
      expect(done.booking.status).toBe('BOOKED')
    } finally {
      fake.restore()
    }
  })

  it('resend on consumed → 409 INTENT_CONSUMED; on dead → 403 INTENT_DEAD', async () => {
    const { intentId, code } = await makePendingIntent('tg-resend-dead@example.com', '+70000008411')
    const { resendIntent, verifyIntentBooking } = await import('@/lib/booking/intentService')
    await verifyIntentBooking(payload, { intentId: String(intentId), otp: code })
    await expect(resendIntent(payload, { intentId: String(intentId) })).rejects.toMatchObject({
      code: 'INTENT_CONSUMED',
      status: 409,
    })

    const { intentId: deadId } = await makePendingIntent('tg-resend-dead2@example.com', '+70000008412')
    for (let i = 0; i < 5; i++) {
      await verifyIntentBooking(payload, { intentId: String(deadId), otp: `11${String(i)}00${i}` }).catch(() => undefined)
    }
    await expect(resendIntent(payload, { intentId: String(deadId) })).rejects.toMatchObject({
      code: 'INTENT_DEAD',
      status: 403,
    })
  })
})

// ---------------------------------------------------------------------------
// T721 — honeypot (FR-703, SC-002)
// ---------------------------------------------------------------------------

describe('T721 — honeypot silent reject', () => {
  const auditHoneypotHitAndCheck = async (route: 'booking' | 'waitlist', aggregate: string): Promise<void> => {
    const { auditHoneypotHit } = await import('@/lib/security/honeypot')
    await auditHoneypotHit(payload, route)
    const res = await db().execute({
      drizzle: db().drizzle,
      sql: sql`SELECT aggregate_type, metadata_json FROM audit_events WHERE action = 'honeypot.hit' ORDER BY id DESC LIMIT 1`,
    })
    const row = res.rows[0] as { aggregate_type: string; metadata_json: Record<string, string> }
    expect(row.aggregate_type).toBe(aggregate)
    expect(row.metadata_json.route).toBe(route)
  }

  it('fill matrix + audit row; empty/absent field passes through', async () => {
    const { honeypotFilled } = await import('@/lib/security/honeypot')
    expect(honeypotFilled({ companyWebsite: 'https://spam.example' })).toBe(true)
    expect(honeypotFilled({ companyWebsite: '   ' })).toBe(false)
    expect(honeypotFilled({ customerName: 'Human' })).toBe(false)

    await auditHoneypotHitAndCheck('booking', 'BOOKING')
    await auditHoneypotHitAndCheck('waitlist', 'WAITLIST')
  })
})

// ---------------------------------------------------------------------------
// T730 — waitlist double-opt-in (FR-704, SC-003, F9)
// ---------------------------------------------------------------------------

describe('T730 — waitlist double-opt-in relay-guard', () => {
  const joinPending = async (phone: string, email: string, svcId?: string) => {
    const svc = svcId ?? (await seedService())
    const { joinWaitlist } = await import('@/lib/waitlist/waitlistService')
    return joinWaitlist(payload, {
      customerName: 'OptIn User',
      customerPhone: phone,
      customerEmail: email,
      serviceId: svc,
      resourceId: '1',
    })
  }

  const matchFreedSlotFor = async (svc: string, slot: string) => {
    const { matchFreedSlot } = await import('@/lib/waitlist/waitlistService')
    return matchFreedSlot(payload, {
      resourceId: '1',
      productId: svc,
      slotStart: slot,
      slotEnd: new Date(new Date(slot).getTime() + 60 * 60 * 1000).toISOString(),
    })
  }

  it('join → pending + opt-in email; matching NEVER notifies pending (SC-003)', async () => {
    const fake = installFakeResend()
    try {
      const svc = await seedService()
      const out = await joinPending('+70000008501', 'tg-optin1@example.com', svc)
      expect(out.optIn).toBe('sent')

      const dbRow = await db().execute({
        drizzle: db().drizzle,
        sql: sql`SELECT status FROM waitlist_entries WHERE id = ${out.entryId}`,
      })
      expect((dbRow.rows[0] as { status: string }).status).toBe('pending')

      // Opt-in email went out (kind waitlist-optin), but the slot-freed match
      // MUST NOT notify a pending entry — our Resend is not a relay.
      expect(fake.calls.some((c) => c.subject.startsWith('Подтвердите подписку'))).toBe(true)
      const { matchFreedSlot } = await import('@/lib/waitlist/waitlistService')
      const slot = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString()
      const match = await matchFreedSlot(payload, {
        resourceId: '1',
        productId: svc,
        slotStart: slot,
        slotEnd: new Date(Date.now() + 73 * 60 * 60 * 1000).toISOString(),
      })
      expect(match.notified).toBe(0)
      expect(fake.calls.some((c) => c.subject.startsWith('Освободился слот'))).toBe(false)
    } finally {
      fake.restore()
    }
  })

  it('confirm (F9 scanner-safe contract) → waiting → enters matching; wrong token → 403; repeat → already_confirmed', async () => {
    const fake = installFakeResend()
    try {
      const svc = await seedService()
      const out = await joinPending('+70000008502', 'tg-optin2@example.com', svc)
      const { confirmWaitlistEntry } = await import('@/lib/waitlist/waitlistService')
      const { computeOptinToken } = await import('@/lib/waitlist/claimToken')

      await expect(
        confirmWaitlistEntry(payload, { entryId: String(out.entryId), token: 'forged' }),
      ).rejects.toMatchObject({ code: 'WAITLIST_TOKEN_INVALID', status: 403 })

      const ok = await confirmWaitlistEntry(payload, { entryId: String(out.entryId), token: computeOptinToken(out.entryId) })
      expect(ok.status).toBe('waiting')

      const again = await confirmWaitlistEntry(payload, { entryId: String(out.entryId), token: computeOptinToken(out.entryId) })
      expect(again.status).toBe('already_confirmed')

      // Now matching sees the entry.
      const slot = new Date(Date.now() + 74 * 60 * 60 * 1000).toISOString()
      const match = await matchFreedSlotFor(svc, slot)
      expect(match.notified).toBe(1)
    } finally {
      fake.restore()
    }
  })

  it('repeat join while pending → resend on the SAME entry (F9), no duplicate row', async () => {
    const svc = await seedService()
    const first = await joinPending('+70000008503', 'tg-optin3@example.com', svc)
    const second = await joinPending('+70000008503', 'tg-optin3@example.com', svc)
    expect(second.optIn).toBe('resent')
    expect(second.entryId).toBe(first.entryId)
    const rows = await db().execute({
      drizzle: db().drizzle,
      sql: sql`SELECT count(*) AS n FROM waitlist_entries WHERE customer_phone = '+70000008503'`,
    })
    expect(Number((rows.rows[0] as { n: number }).n)).toBe(1)
  })

  it('sweep: pending > 48h → expired (FR-704)', async () => {
    const svc = await seedService()
    const out = await joinPending('+70000008504', 'tg-optin4@example.com', svc)
    await db().execute({
      drizzle: db().drizzle,
      sql: sql`UPDATE waitlist_entries SET created_at = now() - interval '49 hours' WHERE id = ${out.entryId}`,
    })
    const { runWaitlistSweep } = await import('@/jobs/waitlistJobs')
    await runWaitlistSweep(payload)
    const row = await db().execute({
      drizzle: db().drizzle,
      sql: sql`SELECT status FROM waitlist_entries WHERE id = ${out.entryId}`,
    })
    expect((row.rows[0] as { status: string }).status).toBe('expired')
  })
})

// ---------------------------------------------------------------------------
// T731 — trust cookie (F1) + intent sweep/purge (F7/F10)
// ---------------------------------------------------------------------------

describe('T731 — trust cookie (FR-706, review F1)', () => {
  it('mint/verify roundtrip; TTL 90d BVA; tamper + future negatives', async () => {
    const { computeTrustToken, verifyTrustToken } = await import('@/lib/booking/trustCookie')
    const now = new Date()
    const token = computeTrustToken('repeat@example.com', now)
    const ok = verifyTrustToken(token, now)
    expect(ok?.email).toBe('repeat@example.com') // the cookie authorizes ONLY its own email

    // TTL: 90d − 1min passes, 91d fails (BVA).
    const almostExpired = verifyTrustToken(
      computeTrustToken('repeat@example.com', new Date(now.getTime() - (90 * 24 * 60 * 60 * 1000 - 60_000))),
      now,
    )
    expect(almostExpired?.email).toBe('repeat@example.com')
    expect(
      verifyTrustToken(computeTrustToken('repeat@example.com', new Date(now.getTime() - 91 * 24 * 60 * 60 * 1000)), now),
    ).toBeNull()
    // Future-dated → null; tampered MAC → null; garbage → null.
    expect(verifyTrustToken(computeTrustToken('repeat@example.com', new Date(now.getTime() + 60_000)), now)).toBeNull()
    expect(verifyTrustToken(token.replace(/.$/, (c) => (c === 'a' ? 'b' : 'a')), now)).toBeNull()
    expect(verifyTrustToken('garbage', now)).toBeNull()
    expect(verifyTrustToken(null, now)).toBeNull()
  })
})

describe('T731 — intent sweep (F10) + GDPR purge (F7)', () => {
  it('sweep: ONLY expired pending → expired; consumed untouched', async () => {
    const { intentId } = await makePendingIntent('tg-sweep@example.com', '+70000008601')
    await db().execute({
      drizzle: db().drizzle,
      sql: sql`UPDATE booking_intents SET expires_at = now() - interval '1 minute' WHERE id = ${intentId}`,
    })
    const { intentId: consumedId, code } = await makePendingIntent('tg-sweep2@example.com', '+70000008602')
    const { verifyIntentBooking } = await import('@/lib/booking/intentService')
    await verifyIntentBooking(payload, { intentId: String(consumedId), otp: code })
    // Backdate the consumed intent to confirm the sweep never touches it (F10).
    await db().execute({
      drizzle: db().drizzle,
      sql: sql`UPDATE booking_intents SET expires_at = now() - interval '2 hours' WHERE id = ${consumedId}`,
    })

    const { runIntentSweep } = await import('@/jobs/intentSweep')
    const out = await runIntentSweep(payload)
    expect(out.expired).toBeGreaterThanOrEqual(1)

    const a = await intentRow(intentId)
    expect(a?.status).toBe('expired')
    const c = await intentRow(consumedId)
    expect(c?.status).toBe('consumed')
  })

  it('purge: dead/expired 31d → gone; consumed 31d → kept; consumed 91d → gone (F7)', async () => {
    const svc = await seedService()
    const { createIntent } = await import('@/lib/booking/intentService')
    const mk = async (email: string, phone: string) =>
      createIntent(payload, {
        productId: svc,
        start: await gridStart(svc, 48),
        customerName: 'Purge',
        customerPhone: phone,
        customerEmail: email,
        ip: '10.7.0.1',
      })
    const dead = await mk('tg-purge-dead@example.com', '+70000008603')
    const expired = await mk('tg-purge-exp@example.com', '+70000008604')
    const consumed = await mk('tg-purge-cons@example.com', '+70000008605')
    await db().execute({
      drizzle: db().drizzle,
      sql: sql`UPDATE booking_intents SET status = 'dead', updated_at = now() - interval '31 days' WHERE id = ${dead.intentId}`,
    })
    await db().execute({
      drizzle: db().drizzle,
      sql: sql`UPDATE booking_intents SET status = 'expired', updated_at = now() - interval '31 days' WHERE id = ${expired.intentId}`,
    })
    await db().execute({
      drizzle: db().drizzle,
      sql: sql`UPDATE booking_intents SET status = 'consumed', updated_at = now() - interval '31 days' WHERE id = ${consumed.intentId}`,
    })

    const { runGdprPurge } = await import('@/jobs/gdprPurge')
    const result = await runGdprPurge(payload)
    expect(result.intentsPurged).toBeGreaterThanOrEqual(2)

    expect(await intentRow(dead.intentId)).toBeUndefined()
    expect(await intentRow(expired.intentId)).toBeUndefined()
    expect(await intentRow(consumed.intentId)).toBeDefined()

    // 91d consumed → gone.
    await db().execute({
      drizzle: db().drizzle,
      sql: sql`UPDATE booking_intents SET updated_at = now() - interval '91 days' WHERE id = ${consumed.intentId}`,
    })
    await runGdprPurge(payload)
    expect(await intentRow(consumed.intentId)).toBeUndefined()
  })
})
