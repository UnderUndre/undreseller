import { expect, test } from '@playwright/test'

/**
 * Booking storefront flow e2e (spec 002-booking-domain US7, TC-002-021).
 * Runs against `pnpm dev` (webServer in playwright.config.ts) — no Stripe needed.
 * Requires a seeded bookable product + weekly hours (run the seed once manually
 * or via /next/seed + admin bookable toggle).
 */
test.describe('booking storefront flow', () => {
  test('guest books a service end-to-end', async ({ page }) => {
    await page.goto('/book')
    // Service selection
    await page.getByTestId('service-option').first().click()
    // Slot grid renders and a slot is selectable
    await expect(page.getByTestId('slot-grid')).toBeVisible()
    const slot = page.getByTestId('slot-option').first()
    await expect(slot).toBeVisible()
    await slot.click()
    // Details
    await page.getByTestId('customer-name').fill('E2E Guest')
    await page.getByTestId('customer-phone').fill('+70000000099')
    await page.getByTestId('booking-submit').click()
    // Confirmation with one-time cancel link
    await expect(page.getByTestId('booking-confirmed')).toBeVisible()
    await expect(page.getByTestId('cancel-link')).toBeVisible()
  })

  test('slot race: second tab gets 409 and the grid refreshes', async ({ browser }) => {
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
    await tab1.getByTestId('booking-submit').click()
    await expect(tab1.getByTestId('booking-confirmed')).toBeVisible()

    await tab2.getByTestId('customer-name').fill('Tab Two')
    await tab2.getByTestId('customer-phone').fill('+70000000097')
    await tab2.getByTestId('booking-submit').click()
    await expect(tab2.getByTestId('booking-conflict')).toBeVisible() // 409 → grid auto-refresh
    await context.close()
  })
})
