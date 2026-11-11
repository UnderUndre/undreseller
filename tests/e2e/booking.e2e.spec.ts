import { expect, test } from '@playwright/test'
import { getPayload } from 'payload'

import config from '../../src/payload.config.js'
import { getOtpCodeFromDb } from '../helpers/otpFromDb'

/**
 * Booking storefront flow e2e (spec 002 US7, updated for spec 007/008 two-phase OTP).
 * Tests guest booking end-to-end (Phase 1 -> 202 -> OTP verify -> 201 confirmed)
 * and concurrent slot race (second tab loses during OTP verification with 409).
 */
test.describe('booking storefront flow', () => {
  test('guest books a service end-to-end with two-phase OTP verification', async ({ page }) => {
    const payload = await getPayload({ config })

    await page.goto('/book')
    // Service selection
    await page.getByTestId('service-option').first().click()
    // Slot grid renders and a slot is selectable
    await expect(page.getByTestId('slot-grid')).toBeVisible()
    const slot = page.getByTestId('slot-option').first()
    await expect(slot).toBeVisible()
    await slot.click()

    // Details (007 requires customer-email for OTP delivery)
    await page.getByTestId('customer-name').fill('E2E Guest')
    await page.getByTestId('customer-phone').fill('+70000000099')
    await page.getByTestId('customer-email').fill('e2e-guest@example.com')

    // Phase 1 submit -> 202 with intentId
    const [bookingResponse] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/booking') && r.status() === 202),
      page.getByTestId('booking-submit').click(),
    ])
    const { intentId } = (await bookingResponse.json()) as { intentId: string }

    // Phase 2: OTP step appears in UI
    await expect(page.getByTestId('booking-otp-step')).toBeVisible()
    const otpInput = page.getByTestId('booking-otp')
    await expect(otpInput).toBeVisible()

    // Derive OTP code from context-bound HMAC in DB and submit
    const code = await getOtpCodeFromDb(payload, intentId)
    await otpInput.fill(code)
    await page.getByTestId('booking-otp-verify').click()

    // Confirmation page reached with one-time cancel button
    await expect(page.getByTestId('booking-confirmed')).toBeVisible()
    await expect(page.getByTestId('cancel-link')).toBeVisible()
  })

  test('slot race: second tab gets 409 conflict during OTP verification', async ({ browser }) => {
    const payload = await getPayload({ config })
    const context = await browser.newContext()
    const tab1 = await context.newPage()
    const tab2 = await context.newPage()

    await tab1.goto('/book')
    await tab2.goto('/book')
    await tab1.getByTestId('service-option').first().click()
    await tab2.getByTestId('service-option').first().click()

    const slot1 = tab1.getByTestId('slot-option').first()
    await expect(slot1).toBeVisible()
    const slotValue = await slot1.getAttribute('data-slot-start')
    await slot1.click()
    await tab2.locator(`[data-slot-start="${slotValue}"]`).first().click()

    await tab1.getByTestId('customer-name').fill('Tab One')
    await tab1.getByTestId('customer-phone').fill('+70000000098')
    await tab1.getByTestId('customer-email').fill('tab1@example.com')

    await tab2.getByTestId('customer-name').fill('Tab Two')
    await tab2.getByTestId('customer-phone').fill('+70000000097')
    await tab2.getByTestId('customer-email').fill('tab2@example.com')

    // Both tabs submit phase 1 concurrently for the same slot
    const [res1, res2] = await Promise.all([
      tab1.waitForResponse((r) => r.url().includes('/api/booking') && r.status() === 202),
      tab2.waitForResponse((r) => r.url().includes('/api/booking') && r.status() === 202),
      tab1.getByTestId('booking-submit').click(),
      tab2.getByTestId('booking-submit').click(),
    ])

    const { intentId: id1 } = (await res1.json()) as { intentId: string }
    const { intentId: id2 } = (await res2.json()) as { intentId: string }

    await expect(tab1.getByTestId('booking-otp-step')).toBeVisible()
    await expect(tab2.getByTestId('booking-otp-step')).toBeVisible()

    // Tab 1 verifies OTP first -> wins the booking
    const code1 = await getOtpCodeFromDb(payload, id1)
    await tab1.getByTestId('booking-otp').fill(code1)
    await tab1.getByTestId('booking-otp-verify').click()
    await expect(tab1.getByTestId('booking-confirmed')).toBeVisible()

    // Tab 2 verifies OTP second -> slot is already taken -> 409 conflict
    const code2 = await getOtpCodeFromDb(payload, id2)
    await tab2.getByTestId('booking-otp').fill(code2)
    await tab2.getByTestId('booking-otp-verify').click()
    await expect(tab2.getByTestId('booking-conflict')).toBeVisible()

    await context.close()
  })
})
