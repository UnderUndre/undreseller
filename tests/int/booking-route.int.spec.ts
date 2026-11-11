import { sql } from '@payloadcms/db-postgres'
import { NextRequest } from 'next/server'
import { getPayload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import configPromise from '@payload-config'
import { resetBookingTables } from './helpers/reset003'
import { getOtpCodeFromDb } from '../helpers/otpFromDb'

/**
 * Route-level integration test suite (spec 008 T851 / F-TQ-02 / F-TQ-03 / F-TQ-04):
 * tests real HTTP route handlers via NextRequest across Phase 1, Phase 2,
 * trust-cookie fast path, honeypot silent-rejects, and waitlist confirmation.
 */

const payload = await getPayload({ config: configPromise })

let serviceId = ''
const testDate = new Date(Date.now() + 48 * 3600 * 1000).toISOString().slice(0, 10)
let slotStart = ''

beforeAll(async () => {
  await resetBookingTables(payload)

  const db: any = payload.db
  await db.execute({
    drizzle: db.drizzle,
    sql: sql`TRUNCATE TABLE weekly_hours, availability_exceptions RESTART IDENTITY CASCADE`,
  })

  const resource = await payload.create({
    collection: 'resources',
    data: { name: 'Route Resource', active: true },
    overrideAccess: true,
  })

  const svc = await payload.create({
    collection: 'products',
    data: {
      title: 'Route Service',
      slug: `route-svc-${Date.now()}`,
      bookable: true,
      durationMin: 60,
      priceInUSD: 25,
      layout: [],
    },
    overrideAccess: true,
  })
  serviceId = String(svc.id)

  const weekday = ((new Date(testDate + 'T00:00:00Z').getUTCDay() + 6) % 7) + 1
  await payload.create({
    collection: 'weekly-hours',
    data: { resourceId: Number(resource.id), weekday, startMin: 0, endMin: 1440 },
    overrideAccess: true,
  })

  const { resolveAvailability } = await import('@/lib/availability/resolver')
  const grid = await resolveAvailability(payload, { productId: serviceId, date: testDate })
  if (!grid.ok || grid.slots.length === 0) throw new Error('Failed to resolve test slot')
  slotStart = grid.slots[0].start

  // Mock fake Resend transport
  process.env.RESEND_API_KEY = 'test-key'
  globalThis.fetch = (async () => new Response(JSON.stringify({ id: 'route_test' }), { status: 200 })) as typeof fetch
})

const postBooking = async (body: unknown, headers: Record<string, string> = {}) => {
  const { POST } = await import('@/app/api/booking/route')
  const req = new NextRequest(new Request('http://localhost:3000/api/booking', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }))
  return POST(req)
}

const postResend = async (body: unknown, headers: Record<string, string> = {}) => {
  const { POST } = await import('@/app/api/booking/resend/route')
  const req = new NextRequest(new Request('http://localhost:3000/api/booking/resend', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  }))
  return POST(req)
}

const postWaitlist = async (body: unknown, headers: Record<string, string> = {}) => {
  const { POST } = await import('@/app/api/waitlist/route')
  const req = new NextRequest(new Request('http://localhost:3000/api/waitlist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  }))
  return POST(req)
}

describe('POST /api/booking — Route Matrix (Phase 1 & Phase 2)', () => {
  it('Phase 1: invalid JSON returns 400 INVALID_JSON', async () => {
    const res = await postBooking('not-valid-json{')
    expect(res.status).toBe(400)
    const json = (await res.json()) as { error?: string }
    expect(json.error).toBe('INVALID_JSON')
  })

  it('Phase 1: missing required fields returns 400 VALIDATION_FAILED', async () => {
    const res = await postBooking({ productId: serviceId })
    expect(res.status).toBe(400)
    const json = (await res.json()) as { error?: string; required?: string[] }
    expect(json.error).toBe('VALIDATION_FAILED')
    expect(json.required).toContain('customerEmail')
  })

  it('Phase 1: honeypot field filled returns silent 200 with zero effects (SC-002)', async () => {
    const res = await postBooking({
      productId: serviceId,
      start: slotStart,
      customerName: 'Spam Bot',
      customerPhone: '+79991112233',
      customerEmail: 'bot@spam.local',
      companyWebsite: 'https://spam.example',
    })
    expect(res.status).toBe(200)
    const json = (await res.json()) as { ok?: boolean }
    expect(json.ok).toBe(true)

    // Verify 0 rows in booking_intents and slot_reservations
    const db: any = payload.db
    const intents = await db.execute({
      drizzle: db.drizzle,
      sql: sql`SELECT count(*) AS n FROM booking_intents WHERE email = 'bot@spam.local'`,
    })
    expect(Number((intents.rows[0] as { n: number }).n)).toBe(0)
  })

  it('Phase 1: valid request returns 202 with intentId', async () => {
    const res = await postBooking({
      productId: serviceId,
      start: slotStart,
      customerName: 'Route Customer',
      customerPhone: '+79991112244',
      customerEmail: 'route-customer@example.com',
    })
    expect(res.status).toBe(202)
    const json = (await res.json()) as { intentId: string; expiresAt: string; emailSent: boolean }
    expect(json.intentId).toBeDefined()
    expect(json.emailSent).toBe(true)
  })

  it('Phase 2: intentId without otp returns 400 VALIDATION_FAILED', async () => {
    const res = await postBooking({ intentId: '99999' })
    expect(res.status).toBe(400)
    const json = (await res.json()) as { error: string }
    expect(json.error).toBe('VALIDATION_FAILED')
  })

  it('Phase 2: valid intentId + OTP returns 201 BOOKED and sets trust-cookie (F-TQ-03)', async () => {
    // 1. Create intent
    const p1 = await postBooking({
      productId: serviceId,
      start: slotStart,
      customerName: 'Trust Customer',
      customerPhone: '+79991112255',
      customerEmail: 'trust-customer@example.com',
    })
    const { intentId } = (await p1.json()) as { intentId: string }

    // 2. Derive OTP from HMAC in test DB
    const otp = await getOtpCodeFromDb(payload, intentId)

    // 3. Submit Phase 2
    const p2 = await postBooking({ intentId, otp })
    expect(p2.status).toBe(201)
    const data = (await p2.json()) as { status: string; reservationId: number }
    expect(data.status).toBe('BOOKED')

    // 4. Verify client_trust_token Set-Cookie header
    const setCookie = p2.headers.get('set-cookie')
    expect(setCookie).toBeDefined()
    expect(setCookie).toContain('client_trust_token=')
    expect(setCookie?.toLowerCase()).toContain('httponly')
    expect(setCookie?.toLowerCase()).toContain('samesite=lax')

    // 5. Trust-cookie fast path: repeat booking with valid cookie skips OTP (201 directly)
    // Extract cookie value
    const match = /client_trust_token=([^;]+)/.exec(setCookie || '')
    const cookieVal = match ? match[1] : ''

    // Resolve the next available slot for repeat booking
    const { resolveAvailability } = await import('@/lib/availability/resolver')
    const freshGrid = await resolveAvailability(payload, { productId: serviceId, date: testDate })
    const nextSlot = freshGrid.ok && freshGrid.slots.length > 0 ? freshGrid.slots[0].start : slotStart

    const p3 = await postBooking(
      {
        productId: serviceId,
        start: nextSlot,
        customerName: 'Trust Customer',
        customerPhone: '+79991112255',
        customerEmail: 'trust-customer@example.com',
      },
      { Cookie: `client_trust_token=${cookieVal}` },
    )
    // Valid trust cookie for same email books directly at 201 without OTP
    expect(p3.status).toBe(201)
    const p3Data = (await p3.json()) as { status: string }
    expect(p3Data.status).toBe('BOOKED')

    // 6. Trust-cookie mismatch: cookie is for trust-customer, but body specifies other email -> falls back to 202 OTP path!
    const freshGrid2 = await resolveAvailability(payload, { productId: serviceId, date: testDate })
    const slot3 = freshGrid2.ok && freshGrid2.slots.length > 0 ? freshGrid2.slots[0].start : slotStart

    const p4 = await postBooking(
      {
        productId: serviceId,
        start: slot3,
        customerName: 'Impostor',
        customerPhone: '+79991112266',
        customerEmail: 'impostor@example.com',
      },
      { Cookie: `client_trust_token=${cookieVal}` },
    )
    expect(p4.status).toBe(202) // Fallback to OTP required
  })
})

describe('POST /api/booking/resend — Route Contract', () => {
  it('resend without intentId returns 400', async () => {
    const res = await postResend({})
    expect(res.status).toBe(400)
  })

  it('resend with honeypot returns silent 200', async () => {
    const res = await postResend({ intentId: '1', companyWebsite: 'spam' })
    expect(res.status).toBe(200)
    const json = (await res.json()) as { ok?: boolean }
    expect(json.ok).toBe(true)
  })
})

describe('POST /api/waitlist & confirm — Route Contract', () => {
  it('waitlist join with honeypot returns silent 200 and creates 0 entries', async () => {
    const res = await postWaitlist({
      customerName: 'Bot',
      customerPhone: '+79990009999',
      customerEmail: 'bot@spam.local',
      serviceId,
      companyWebsite: 'spam.example',
    })
    expect(res.status).toBe(200)
    const db: any = payload.db
    const count = await db.execute({
      drizzle: db.drizzle,
      sql: sql`SELECT count(*) AS n FROM waitlist_entries WHERE customer_email = 'bot@spam.local'`,
    })
    expect(Number((count.rows[0] as { n: number }).n)).toBe(0)
  })

  it('waitlist confirm route validates tokens and returns 200 on success', async () => {
    // 1. Join waitlist
    const joinRes = await postWaitlist({
      customerName: 'Waitlist Customer',
      customerPhone: '+79998881122',
      customerEmail: 'wl-customer@example.com',
      serviceId,
    })
    expect(joinRes.status).toBe(201)
    const { entryId } = (await joinRes.json()) as { entryId: number }

    const { POST: confirmPost } = await import('@/app/api/waitlist/[entryId]/confirm/route')
    const { computeOptinToken } = await import('@/lib/waitlist/claimToken')

    // 2. Confirm without token returns 400
    const r1 = await confirmPost(
      new NextRequest(new Request('http://localhost:3000/api/waitlist/1/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })),
      { params: Promise.resolve({ entryId: String(entryId) }) },
    )
    expect(r1.status).toBe(400)

    // 3. Confirm with forged token returns 403
    const r2 = await confirmPost(
      new NextRequest(new Request('http://localhost:3000/api/waitlist/1/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'forged' }),
      })),
      { params: Promise.resolve({ entryId: String(entryId) }) },
    )
    expect(r2.status).toBe(403)

    // 4. Confirm with valid HMAC token returns 200 waiting
    const validToken = computeOptinToken(entryId)
    const r3 = await confirmPost(
      new NextRequest(new Request('http://localhost:3000/api/waitlist/1/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: validToken }),
      })),
      { params: Promise.resolve({ entryId: String(entryId) }) },
    )
    expect(r3.status).toBe(200)
    const r3Json = (await r3.json()) as { status: string }
    expect(r3Json.status).toBe('waiting')
  })
})
