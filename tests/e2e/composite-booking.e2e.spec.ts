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
  seedService,
  trackBooking,
  uniqueFutureDate,
  uniqueXffHeaders,
} from '../helpers/seed-booking'

/**
 * Composite booking journey e2e (spec 014 US1 / 015 FR-1501, T1510):
 * checkboxes → running Σ total → container grid → items[] submit → OTP →
 * itemized confirmation. Plus cache isolation (fix AG-F3.1) and the composite
 * 409 race. Locators: data-testid canon only (NFR-1506).
 */
test.describe('composite booking journey (014 US1 / 015 US1)', () => {
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

  test('composite basket: checkboxes → Σ total → container grid → items[] → OTP → itemized confirmation', async ({ page }) => {
    test.setTimeout(90_000)
    const payload = await getPayload({ config })
    const xff = uniqueXffHeaders()
    await page.setExtraHTTPHeaders(xff)
    const capture = captureBookingPosts(page)

    const primary = await seedService(payload, { durationMin: 60, price: 25, title: 'E2E Primary Cut' })
    const freeAddOn = await seedService(payload, { addOn: true, durationMin: 0, price: 0, title: 'E2E Free Styling' })
    const second = await seedService(payload, { durationMin: 15, price: 10, title: 'E2E Wash' })
    const date = uniqueFutureDate()

    await gotoBookingDate(page, primary.slug, date)
    await expect(page.getByTestId('addon-block')).toBeVisible()

    // Each selection recomputes the container grid: 60 → 60+0 → 60+0+15 = 75.
    await page.getByTestId(`addon-${freeAddOn.id}`).check()
    await page.getByTestId(`addon-${second.id}`).check()
    const compositeProbe = await page.request.get(
      `/api/availability?service=${primary.id}&items=${primary.id}&items=${freeAddOn.id}&items=${second.id}&date=${date}`,
      { headers: xff },
    )
    expect(compositeProbe.status()).toBe(200)
    expect(((await compositeProbe.json()) as { totalDurationMin?: number }).totalDurationMin).toBe(75)

    await expect(page.getByTestId('basket-total')).toContainText('75 min')
    await expect(page.getByTestId('basket-total')).toContainText('$35.00')

    await page.getByTestId('slot-option').first().click()
    await page.getByTestId('customer-name').fill('Composite QA')
    await page.getByTestId('customer-phone').fill('+79160000001')
    await page.getByTestId('customer-email').fill('composite-e2e@example.com')

    const [bookingResponse] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/booking') && r.status() === 202),
      page.getByTestId('booking-submit').click(),
    ])
    const { intentId } = (await bookingResponse.json()) as { intentId: string }

    await expect(page.getByTestId('booking-otp-step')).toBeVisible()
    const code = await getOtpCodeFromDb(payload, intentId)
    await page.getByTestId('booking-otp').fill(code)
    await page.getByTestId('booking-otp-verify').click()

    await expect(page.getByTestId('booking-confirmed')).toBeVisible()
    // The 201 body is captured via route interception (body-read race safe)
    const booking = capture.last
    expect(booking).toBeTruthy()
    if (!booking) throw new Error('booking body not captured')
    trackBooking(booking.reservationId, booking.orderId)

    expect(booking.items?.length).toBe(3)
    expect(booking.items?.[0].productId).toBe(primary.id)
    expect(booking.totalDurationMin).toBe(75)
    expect(booking.totalPriceInUSD).toBe(35)

    const itemLines = page.getByTestId('booking-items').locator('li')
    await expect(itemLines).toHaveCount(3)
    await expect(itemLines.first()).toContainText(primary.title)
    await expect(itemLines.nth(1)).toContainText('(add-on)')
    // NONE basket → no payment block on confirmation
    await expect(page.getByTestId('deposit-payment-section')).toHaveCount(0)
    // Money canon (fix AG-F2): NONE basket → orders.amount = 0
    const order = await orderRow(payload, booking.orderId)
    expect(Number(order?.amount)).toBe(0)
  })

  test('cache isolation: 60-min and 75-min grids stay separate under one service (fix AG-F3.1)', async ({ page }) => {
    const payload = await getPayload({ config })
    const xff = uniqueXffHeaders()
    await page.setExtraHTTPHeaders(xff)

    const primary = await seedService(payload, { durationMin: 60, price: 25 })
    const second = await seedService(payload, { durationMin: 15, price: 10 })
    const date = uniqueFutureDate()

    await gotoBookingDate(page, primary.slug, date)

    const single = await page.request.get(`/api/availability?service=${primary.id}&date=${date}`, { headers: xff })
    expect(single.status()).toBe(200)
    const singleJson = (await single.json()) as { slots: Array<{ start: string; end: string }> }
    expect(singleJson.slots.length).toBeGreaterThan(0)
    const singleSpan =
      new Date(singleJson.slots[0].end).getTime() - new Date(singleJson.slots[0].start).getTime()

    const composite = await page.request.get(
      `/api/availability?service=${primary.id}&items=${primary.id}&items=${second.id}&date=${date}`,
      { headers: xff },
    )
    expect(composite.status()).toBe(200)
    const compositeJson = (await composite.json()) as {
      totalDurationMin?: number
      slots: Array<{ start: string; end: string }>
    }
    expect(compositeJson.totalDurationMin).toBe(75)
    expect(compositeJson.slots.length).toBeGreaterThan(0)
    const compositeSpan =
      new Date(compositeJson.slots[0].end).getTime() - new Date(compositeJson.slots[0].start).getTime()

    // Same service+date, different baskets → different cache keys (AG-F3.1):
    // the 60-min answer must NOT poison the 75-min grid and vice versa.
    expect(singleSpan).toBe(60 * 60_000)
    expect(compositeSpan).toBe(75 * 60_000)

    const compositeCached = await page.request.get(
      `/api/availability?service=${primary.id}&items=${primary.id}&items=${second.id}&date=${date}`,
      { headers: xff },
    )
    expect(compositeCached.status()).toBe(200)
    expect(((await compositeCached.json()) as { slots: Array<{ start: string }> }).slots[0].start).toBe(
      compositeJson.slots[0].start,
    )
  })

  test('composite race: two contexts on one container start → one wins, other 409', async ({ browser }) => {
    test.setTimeout(90_000)
    const payload = await getPayload({ config })
    const primary = await seedService(payload, { durationMin: 60 })
    const second = await seedService(payload, { durationMin: 15 })
    const date = uniqueFutureDate()

    const context1 = await browser.newContext()
    await context1.setExtraHTTPHeaders(uniqueXffHeaders())
    const context2 = await browser.newContext()
    await context2.setExtraHTTPHeaders(uniqueXffHeaders())

    const tab1 = await context1.newPage()
    const tab2 = await context2.newPage()
    for (const tab of [tab1, tab2]) {
      await gotoBookingDate(tab, primary.slug, date)
      await Promise.all([
        tab.waitForResponse((r) => r.url().includes('/api/availability') && r.url().includes('items=')),
        tab.getByTestId(`addon-${second.id}`).check(),
      ])
    }
    await expect(tab1.getByTestId('slot-option').first()).toBeVisible({ timeout: 10_000 })

    const slotStart = (await tab1.getByTestId('slot-option').first().getAttribute('data-slot-start')) as string
    await tab1.getByTestId('slot-option').first().click()
    await tab2.locator(`[data-slot-start="${slotStart}"]`).first().click()

    for (const [tab, email] of [
      [tab1, 'race-c1@example.com'],
      [tab2, 'race-c2@example.com'],
    ] as const) {
      await tab.getByTestId('customer-name').fill(`Racer ${email}`)
      await tab.getByTestId('customer-phone').fill('+79160000009')
      await tab.getByTestId('customer-email').fill(email)
    }

    const [res1, res2] = await Promise.all([
      tab1.waitForResponse((r) => r.url().includes('/api/booking') && r.status() === 202),
      tab2.waitForResponse((r) => r.url().includes('/api/booking') && r.status() === 202),
      tab1.getByTestId('booking-submit').click(),
      tab2.getByTestId('booking-submit').click(),
    ])
    const id1 = ((await res1.json()) as { intentId: string }).intentId
    const id2 = ((await res2.json()) as { intentId: string }).intentId

    await expect(tab1.getByTestId('booking-otp-step')).toBeVisible()
    await expect(tab2.getByTestId('booking-otp-step')).toBeVisible()

    const code1 = await getOtpCodeFromDb(payload, id1)
    await tab1.getByTestId('booking-otp').fill(code1)
    await tab1.getByTestId('booking-otp-verify').click()
    await expect(tab1.getByTestId('booking-confirmed')).toBeVisible()

    const code2 = await getOtpCodeFromDb(payload, id2)
    await tab2.getByTestId('booking-otp').fill(code2)
    await tab2.getByTestId('booking-otp-verify').click()
    await expect(tab2.getByTestId('booking-conflict')).toBeVisible()

    await context1.close()
    await context2.close()
  })
})
