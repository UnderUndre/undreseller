import { expect, test } from '@playwright/test'
import { getPayload } from 'payload'

import config from '../../src/payload.config.js'
import { getOtpCodeFromDb } from '../helpers/otpFromDb'
import {
  captureBookingPosts,
  cleanupSeedData,
  ensureWeeklyHoursAllWeek,
  getDefaultResourceId,
  gotoBookingDate,
  orderRow,
  reservationRow,
  seedService,
  trackBooking,
  uniqueFutureDate,
  uniqueXffHeaders,
} from '../helpers/seed-booking'

/**
 * Money surfaces e2e (spec 003/012/014 US3 / 015 FR-1502, T1511): the
 * confirmation page aggregates Σ deposits / Σ price from `items_json` (fix
 * AG-F6.2) and renders <DepositPayment> through the E2E_GATEWAY=fake seam
 * (fix AG-F1.1) — zero real Stripe/network involvement (NFR-1505).
 * Money canon asserted at DB level: orders.amount = chargeable (fix AG-F2).
 */
test.describe('money surfaces (014 US3 / 015 US2)', () => {
  let resourceId = ''

  test.beforeAll(async () => {
    const payload = await getPayload({ config })
    resourceId = await getDefaultResourceId(payload)
    await ensureWeeklyHoursAllWeek(payload, resourceId)
  })

  test.afterAll(async () => {
    const payload = await getPayload({ config })
    await cleanupSeedData(payload)
  })

  /** Books a basket through the real two-phase UI flow; returns the captured 201 body. */
  async function bookViaUi(
    page: import('@playwright/test').Page,
    primarySlug: string,
    addOnIds: string[],
    date: string,
    email: string,
    payload: import('payload').Payload,
  ): Promise<NonNullable<ReturnType<typeof captureBookingPosts>['last']>> {
    await page.setExtraHTTPHeaders(uniqueXffHeaders())
    const capture = captureBookingPosts(page)
    await gotoBookingDate(page, primarySlug, date)
    for (const addOnId of addOnIds) {
      await Promise.all([
        page.waitForResponse((r) => r.url().includes('/api/availability') && r.url().includes('items=')),
        page.getByTestId(`addon-${addOnId}`).check(),
      ])
    }
    await page.getByTestId('slot-option').first().click()
    await page.getByTestId('customer-name').fill('Money QA')
    await page.getByTestId('customer-phone').fill('+79160000021')
    await page.getByTestId('customer-email').fill(email)
    const [intentResponse] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/booking') && r.status() === 202),
      page.getByTestId('booking-submit').click(),
    ])
    const { intentId } = (await intentResponse.json()) as { intentId: string }
    await expect(page.getByTestId('booking-otp-step')).toBeVisible()
    const code = await getOtpCodeFromDb(payload, intentId)
    await page.getByTestId('booking-otp').fill(code)
    await page.getByTestId('booking-otp-verify').click()
    await expect(page.getByTestId('booking-confirmed')).toBeVisible()
    const booking = capture.last
    expect(booking).toBeTruthy()
    if (!booking) throw new Error('booking body not captured')
    trackBooking(booking.reservationId, booking.orderId)
    return booking
  }

  test('DEPOSIT basket: confirmation DepositPayment shows Σ deposits from items_json (fix AG-F6.2, fake gateway)', async ({ page }) => {
    test.setTimeout(90_000)
    const payload = await getPayload({ config })
    const depA = await seedService(payload, { durationMin: 60, price: 100, mode: 'DEPOSIT', deposit: 25 })
    const depB = await seedService(payload, { durationMin: 15, price: 80, mode: 'DEPOSIT', deposit: 10 })
    const booking = await bookViaUi(
      page,
      depA.slug,
      [depB.id],
      uniqueFutureDate(),
      'deposit-basket-e2e@example.com',
      payload,
    )

    // The fake gateway issued a Stripe-format pi_e2e_ secret (fix AG-F1.1)
    const paymentBlock = page.getByTestId('deposit-payment-section')
    await expect(paymentBlock).toBeVisible()
    const form = page.getByTestId('deposit-payment-form')
    await expect(form).toContainText('$35') // Σ depositAmount = 25 + 10 (NOT the single-service $25)
    await expect(form).toContainText('$145.00') // remaining = Σ price 180 − 35 deposits
    await expect(page.getByTestId('deposit-pay-button')).toBeVisible()
    // Itemized list shows both positions
    await expect(page.getByTestId('booking-items').locator('li')).toHaveCount(2)
    // Money canon at DB level (fix AG-F2): DEPOSIT → orders.amount = Σ deposits
    const order = await orderRow(payload, booking.orderId)
    expect(Number(order?.amount)).toBe(3500)
    const row = await reservationRow(payload, booking.reservationId)
    expect(Number(row?.total_duration_min)).toBe(75)
  })

  test('NONE basket: no payment block on confirmation, orders.amount = 0', async ({ page }) => {
    test.setTimeout(90_000)
    const payload = await getPayload({ config })
    const primary = await seedService(payload, { durationMin: 60, price: 25 })
    const booking = await bookViaUi(page, primary.slug, [], uniqueFutureDate(), 'none-basket-e2e@example.com', payload)
    await expect(page.getByTestId('deposit-payment-section')).toHaveCount(0)
    await expect(page.getByTestId('deposit-payment-form')).toHaveCount(0)
    const order = await orderRow(payload, booking.orderId)
    expect(Number(order?.amount)).toBe(0)
  })

  test('legacy DEPOSIT single booking: DepositPayment via itemId fallback', async ({ page }) => {
    test.setTimeout(90_000)
    const payload = await getPayload({ config })
    const solo = await seedService(payload, { durationMin: 60, price: 60, mode: 'DEPOSIT', deposit: 15 })
    const booking = await bookViaUi(page, solo.slug, [], uniqueFutureDate(), 'legacy-deposit-e2e@example.com', payload)
    const form = page.getByTestId('deposit-payment-form')
    await expect(form).toContainText('$15')
    await expect(form).toContainText('$45') // remaining = 60 − 15
    const order = await orderRow(payload, booking.orderId)
    expect(Number(order?.amount)).toBe(1500)
    const row = await reservationRow(payload, booking.reservationId)
    expect(row?.items_json).toBeNull() // legacy single-item row keeps the NULL snapshot canon
  })
})
