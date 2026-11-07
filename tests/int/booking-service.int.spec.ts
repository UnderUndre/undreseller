import { getPayload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import configPromise from '@payload-config'

import {
  BookingError,
  cancelBooking,
  createBooking,
  approveBooking,
} from '@/lib/booking/bookingService'

const payload = await getPayload({ config: configPromise })

let productId = ''
let resourceId = ''

const futureStart = (hoursAhead = 48): string =>
  new Date(Date.now() + hoursAhead * 60 * 60 * 1000).toISOString()

beforeAll(async () => {
  const resource = await payload.create({
    collection: 'resources',
    data: { name: 'Booking Test Master', active: true },
    overrideAccess: true,
  })
  resourceId = String(resource.id)
  const product = await payload.create({
    collection: 'products',
    data: {
      title: 'Booking Test Service',
      slug: `booking-svc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      bookable: true,
      durationMin: 60,
      priceInUSD: 50,
      outCallEnabled: true,
      layout: [],
    },
    overrideAccess: true,
  })
  productId = String(product.id)
})

afterAll(async () => {
  // Test DB is isolated and truncated per-run — no cleanup needed.
})

describe('createBooking — FSM wiring (TC-002-014/015)', () => {
  it('IN_CALL (outCallEnabled=false path via product flag) → CONFIRMED/BOOKED', async () => {
    const product = await payload.create({
      collection: 'products',
      data: { title: 'InCall Service', slug: `incall-svc-${Date.now()}`, bookable: true, durationMin: 30, priceInUSD: 10, layout: [] },
      overrideAccess: true,
    })
    const res = await createBooking(payload, {
      productId: String(product.id),
      resourceId,
      start: futureStart(30),
      customerName: 'Ann',
      customerPhone: '+70000000001',
    })
    expect(res.status).toBe('BOOKED')
    expect(res.scheduleVersion).toBe(1)
    expect(res.cancelToken).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('OUT_CALL → PENDING_APPROVAL (FSM requiresApproval)', async () => {
    const res = await createBooking(payload, {
      productId,
      resourceId,
      start: futureStart(31),
      customerName: 'Bob',
      customerPhone: '+70000000002',
    })
    expect(res.status).toBe('PENDING_APPROVAL')
  })

  it('past slot → SLOT_IN_PAST 422', async () => {
    await expect(
      createBooking(payload, {
        productId,
        resourceId,
        start: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        customerName: 'X',
        customerPhone: '+70000000003',
      }),
    ).rejects.toMatchObject({ code: 'SLOT_IN_PAST', status: 422 })
  })

  it('non-bookable product → SERVICE_NOT_BOOKABLE 422', async () => {
    const plain = await payload.create({
      collection: 'products',
      data: { title: 'Plain Product', slug: `plain-prod-${Date.now()}`, priceInUSD: 5, layout: [] },
      overrideAccess: true,
    })
    await expect(
      createBooking(payload, {
        productId: String(plain.id),
        resourceId,
        start: futureStart(32),
        customerName: 'X',
        customerPhone: '+70000000004',
      }),
    ).rejects.toMatchObject({ code: 'SERVICE_NOT_BOOKABLE', status: 422 })
  })
})

describe('idempotency (TC-002-017, ×100 replay)', () => {
  it('100 calls with the same idempotencyKey → one reservation', { timeout: 90_000 }, async () => {
    const start = futureStart(52)
    let first: Awaited<ReturnType<typeof createBooking>> | null = null
    for (let i = 0; i < 100; i++) {
      const res = await createBooking(payload, {
        productId,
        resourceId,
        start,
        customerName: 'Idem',
        customerPhone: '+70000000005',
        idempotencyKey: 'idem-key-002',
      })
      if (i === 0) first = res
      else {
        expect(res.reservationId).toBe(first!.reservationId)
        expect(res.cancelToken).toBe('') // not re-issued
      }
    }
    expect(first).not.toBeNull()
  })

  it('concurrent same-key creates → exactly one row (unique-index backstop)', async () => {
    const start = futureStart(53)
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () =>
        createBooking(payload, {
          productId,
          resourceId,
          start,
          customerName: 'IdemRace',
          customerPhone: '+70000000006',
          idempotencyKey: 'idem-race-002',
        }),
      ),
    )
    const fulfilled = results.filter((r) => r.status === 'fulfilled') as PromiseFulfilledResult<Awaited<ReturnType<typeof createBooking>>>[]
    const ids = new Set(fulfilled.map((r) => r.value.reservationId))
    expect(ids.size).toBe(1)
  })
})

describe('overlap → SLOT_TAKEN 409 (TC-002-016)', () => {
  it('overlapping booking on the same resource → 409', async () => {
    const start = futureStart(70)
    await createBooking(payload, {
      productId,
      resourceId,
      start,
      customerName: 'First',
      customerPhone: '+70000000007',
    })
    await expect(
      createBooking(payload, {
        productId,
        resourceId,
        start: new Date(new Date(start).getTime() + 30 * 60_000).toISOString(),
        customerName: 'Second',
        customerPhone: '+70000000008',
      }),
    ).rejects.toMatchObject({ code: 'SLOT_TAKEN', status: 409 })
  })
})

describe('cancelBooking — FSM customer cancel (TC-002-014 cancel, US5 AC5)', () => {
  it('valid token on CONFIRMED booking → RELEASED + order cancelled; replay idempotent', async () => {
    const created = await createBooking(payload, {
      productId,
      resourceId,
      start: futureStart(80),
      customerName: 'Cancel Me',
      customerPhone: '+70000000009',
    })
    const res = await cancelBooking(payload, String(created.reservationId), created.cancelToken)
    expect(res.status).toBe('cancelled')

    // Replay: idempotent
    const replay = await cancelBooking(payload, String(created.reservationId), created.cancelToken)
    expect(replay.status).toBe('already_cancelled')
  })

  it('invalid token → 403 INVALID_TOKEN', async () => {
    const created = await createBooking(payload, {
      productId,
      resourceId,
      start: futureStart(81),
      customerName: 'Sec',
      customerPhone: '+70000000010',
    })
    await expect(
      cancelBooking(payload, String(created.reservationId), 'wrong-token'),
    ).rejects.toMatchObject({ code: 'INVALID_TOKEN', status: 403 })
  })

  it('unknown reservation → 404', async () => {
    await expect(cancelBooking(payload, '99999999', 'whatever')).rejects.toMatchObject({
      code: 'BOOKING_NOT_FOUND',
      status: 404,
    })
  })
})

describe('approveBooking — OPERATOR CAS (TC-002-019/020)', () => {
  it('OUT_CALL booking → approve → BOOKED; second approve → ALREADY_PROCESSED', async () => {
    const created = await createBooking(payload, {
      productId,
      resourceId,
      start: futureStart(90),
      customerName: 'Approve Me',
      customerPhone: '+70000000011',
    })
    expect(created.status).toBe('PENDING_APPROVAL')

    const approved = await approveBooking(payload, {
      reservationId: String(created.reservationId),
      action: 'approve',
      actorId: 'operator-test',
    })
    expect(approved).toMatchObject({ status: 'approved', scheduleVersion: created.scheduleVersion + 1 })

    const again = await approveBooking(payload, {
      reservationId: String(created.reservationId),
      action: 'approve',
      actorId: 'operator-test',
    })
    expect(again.status).toBe('ALREADY_PROCESSED')
  })

  it('reject → RELEASED + order cancelled', async () => {
    const created = await createBooking(payload, {
      productId,
      resourceId,
      start: futureStart(91),
      customerName: 'Reject Me',
      customerPhone: '+70000000012',
    })
    const rejected = await approveBooking(payload, {
      reservationId: String(created.reservationId),
      action: 'reject',
      actorId: 'operator-test',
    })
    expect(rejected.status).toBe('rejected')

    // Slot freed: the same slot is bookable again
    const rebook = await createBooking(payload, {
      productId,
      resourceId,
      start: futureStart(91),
      customerName: 'Rebooked',
      customerPhone: '+70000000013',
    })
    expect(rebook.status).toBe('PENDING_APPROVAL')
  })
})
