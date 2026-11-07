import { BookingError, createBooking, pgErrorCode } from '@/lib/booking/bookingService'
import { ACTIVE_STATUSES } from '@/lib/availability/resolver'

import { sql } from '@payloadcms/db-postgres'
import { getPayload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import configPromise from '@payload-config'

/**
 * Double-booking defense integration tests (spec 002-booking-domain US2,
 * TC-002-005..007): L1 advisory lock + L2 GiST exclusion, race-hammered.
 */
const db: any = (await getPayload({ config: configPromise })).db

const RESOURCE = 'race-resource-001'
const START = '2030-01-15T10:00:00.000Z' // Wednesday, far future
const END = '2030-01-15T11:00:00.000Z'

async function ensureGiST(): Promise<void> {
  // The test DB is push-managed: apply the defense DDL idempotently (prod gets
  // the same DDL via src/migrations).
  await db.execute({
    drizzle: db.drizzle,
    sql: sql`CREATE EXTENSION IF NOT EXISTS btree_gist`,
  })
  await db.execute({
    drizzle: db.drizzle,
    sql: sql`DO $$ BEGIN
      ALTER TABLE slot_reservations ADD CONSTRAINT slot_reservations_no_overlap_test
        EXCLUDE USING gist ("resource_id" WITH =, tstzrange("start_time", "end_time", '[)') WITH &&)
        WHERE (status IN ('HELD', 'BOOKED', 'PENDING_APPROVAL'));
    EXCEPTION WHEN duplicate_object THEN NULL; WHEN exclusion_violation THEN NULL; WHEN duplicate_table THEN NULL; END $$`,
  })
  await db.execute({
    drizzle: db.drizzle,
    sql: sql`CREATE UNIQUE INDEX IF NOT EXISTS "slot_reservations_idempotency_key_uidx_test"
      ON "slot_reservations" ("idempotency_key") WHERE "idempotency_key" IS NOT NULL`,
  })
}

async function rawInsertBooking(resourceId: string, start: string, end: string): Promise<void> {
  await db.drizzle.transaction(async (trx: any) => {
    await trx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('resource_slot_lock_' || ${resourceId}))`)
    await trx.execute(sql`
      INSERT INTO slot_reservations
        (resource_id, start_time, end_time, total_duration_min, status, schedule_version,
         buffer_before_min, buffer_after_min, customer_name, customer_phone, created_at, updated_at)
      VALUES (${resourceId}, ${start}, ${end}, 60, 'BOOKED', 1, 0, 0, 'Race', '+70000000000', now(), now())`)
  })
}

beforeAll(async () => {
  // Cleanup BEFORE constraint creation: leftover rows from a previous run would
  // make the EXCLUDE creation fail with 23P01 (the DO guard only silences
  // duplicate_object).
  await db.execute({
    drizzle: db.drizzle,
    sql: sql`DELETE FROM slot_reservations WHERE resource_id LIKE ${RESOURCE + '%'}`,
  })
  await ensureGiST()
  // Clean the race resource rows from previous runs.
})

afterAll(async () => {
  await db.execute({
    drizzle: db.drizzle,
    sql: sql`DELETE FROM slot_reservations WHERE resource_id LIKE ${RESOURCE + '%'}`,
  })
})

describe('GiST exclusion — raw race hammer (TC-002-005)', () => {
  it('100 concurrent inserts on the same interval → exactly 1 wins', { timeout: 60_000 }, async () => {
    const attempts = await Promise.allSettled(
      Array.from({ length: 100 }, () => rawInsertBooking(RESOURCE, START, END)),
    )
    const won = attempts.filter((r) => r.status === 'fulfilled').length
    const lost = attempts.filter(
      (r) =>
        r.status === 'rejected' &&
        String(pgErrorCode((r as PromiseRejectedResult).reason)) === '23P01',
    ).length
    expect(won).toBe(1)
    expect(lost).toBe(99)
  })

  it('different resources, same interval → both win (TC-002-006)', async () => {
    await rawInsertBooking(`${RESOURCE}-a`, START, END)
    await expect(rawInsertBooking(`${RESOURCE}-b`, START, END)).resolves.toBeUndefined()
  })
})

describe('bookingService under concurrency (TC-002-005 service-level)', () => {
  it('10 concurrent createBooking calls → exactly 1 success, 9 × SLOT_TAKEN', { timeout: 60_000 }, async () => {
    const payload = await getPayload({ config: configPromise })
    const product = await payload.create({
      collection: 'products',
      data: { title: 'Race Service', slug: `race-svc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, bookable: true, durationMin: 60, priceInUSD: 50, layout: [] },
      overrideAccess: true,
    })
    const start = '2030-02-20T10:00:00.000Z'
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) =>
        createBooking(payload, {
          productId: String(product.id),
          resourceId: `${RESOURCE}-svc`,
          start,
          customerName: `Racer ${i}`,
          customerPhone: '+70000000000',
          idempotencyKey: `race-${i}`,
        }),
      ),
    )
    const created = results.filter((r) => r.status === 'fulfilled')
    const taken = results.filter(
      (r) =>
        r.status === 'rejected' &&
        (r as PromiseRejectedResult).reason instanceof BookingError &&
        ((r as PromiseRejectedResult).reason as BookingError).code === 'SLOT_TAKEN',
    )
    expect(created.length).toBe(1)
    expect(taken.length).toBe(9)
  })
})

describe('Active statuses (GiST predicate)', () => {
  it('covers exactly HELD / BOOKED / PENDING_APPROVAL', () => {
    expect(ACTIVE_STATUSES).toEqual(['HELD', 'BOOKED', 'PENDING_APPROVAL'])
  })
})
