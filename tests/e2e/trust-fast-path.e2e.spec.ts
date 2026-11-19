import { expect, test } from '@playwright/test'
import { getPayload } from 'payload'

import config from '../../src/payload.config.js'
import { getOtpCodeFromDb } from '../helpers/otpFromDb'
import {
  cleanupSeedData,
  ensureWeeklyHoursAllWeek,
  getDefaultResourceId,
  gotoBookingDate,
  seedService,
  uniqueFutureDate,
  uniqueXffHeaders,
} from '../helpers/seed-booking'

/**
 * Trust-cookie fast path e2e (spec 007 F1 / 015 FR-1504, T1521): a verified
 * booking mints the trust cookie for the email — the NEXT booking of the SAME
 * email skips the OTP phase entirely (direct 201); a different email on the
 * same browser still gets the OTP phase.
 */
test.describe('trust-cookie fast path (007 F1 / 015 US4)', () => {
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

  test('second booking of the same email skips OTP (direct 201)', async ({ page }) => {
    test.setTimeout(120_000)
    const payload = await getPayload({ config })
    await page.setExtraHTTPHeaders(uniqueXffHeaders())
    const svcA = await seedService(payload, { durationMin: 60, price: 25 })
    const svcB = await seedService(payload, { durationMin: 30, price: 30 })

    // Booking #1 — full OTP flow mints the trust cookie on verify
    await gotoBookingDate(page, svcA.slug, uniqueFutureDate())
    await page.getByTestId('slot-option').first().click()
    await page.getByTestId('customer-name').fill('Trusted')
    await page.getByTestId('customer-phone').fill('+79160000041')
    await page.getByTestId('customer-email').fill('trusted-e2e@example.com')
    const [intent1] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/booking') && r.status() === 202),
      page.getByTestId('booking-submit').click(),
    ])
    const { intentId } = (await intent1.json()) as { intentId: string }
    await expect(page.getByTestId('booking-otp-step')).toBeVisible()
    const code = await getOtpCodeFromDb(payload, intentId)
    await page.getByTestId('booking-otp').fill(code)
    await page.getByTestId('booking-otp-verify').click()
    await expect(page.getByTestId('booking-confirmed')).toBeVisible()

    // Booking #2 — SAME email, NEW slot: the cookie skips the OTP phase (F1)
    await gotoBookingDate(page, svcB.slug, uniqueFutureDate())
    await page.getByTestId('slot-option').first().click()
    await page.getByTestId('customer-name').fill('Trusted')
    await page.getByTestId('customer-phone').fill('+79160000041')
    await page.getByTestId('customer-email').fill('trusted-e2e@example.com')
    await page.getByTestId('booking-submit').click()
    await expect(page.getByTestId('booking-confirmed')).toBeVisible()
    await expect(page.getByTestId('booking-otp-step')).toHaveCount(0)
  })

  test('mismatched email on the same browser still gets the OTP phase', async ({ page }) => {
    test.setTimeout(120_000)
    const payload = await getPayload({ config })
    await page.setExtraHTTPHeaders(uniqueXffHeaders())
    const svcA = await seedService(payload, { durationMin: 60, price: 25 })
    const svcB = await seedService(payload, { durationMin: 30, price: 30 })

    // Booking #1 with email A (mints cookie bound to email A)
    await gotoBookingDate(page, svcA.slug, uniqueFutureDate())
    await page.getByTestId('slot-option').first().click()
    await page.getByTestId('customer-name').fill('Owner A')
    await page.getByTestId('customer-phone').fill('+79160000042')
    await page.getByTestId('customer-email').fill('owner-a-e2e@example.com')
    const [intent1] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/booking') && r.status() === 202),
      page.getByTestId('booking-submit').click(),
    ])
    const { intentId } = (await intent1.json()) as { intentId: string }
    const code = await getOtpCodeFromDb(payload, intentId)
    await page.getByTestId('booking-otp').fill(code)
    await page.getByTestId('booking-otp-verify').click()
    await expect(page.getByTestId('booking-confirmed')).toBeVisible()

    // Booking #2 with email B — the cookie authorizes ONLY its own email (F1)
    await gotoBookingDate(page, svcB.slug, uniqueFutureDate())
    await page.getByTestId('slot-option').first().click()
    await page.getByTestId('customer-name').fill('Owner B')
    await page.getByTestId('customer-phone').fill('+79160000043')
    await page.getByTestId('customer-email').fill('owner-b-e2e@example.com')
    await page.getByTestId('booking-submit').click()
    await expect(page.getByTestId('booking-otp-step')).toBeVisible()
  })
})
