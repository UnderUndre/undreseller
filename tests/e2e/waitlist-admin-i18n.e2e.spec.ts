import { expect, test } from '@playwright/test'
import { getPayload } from 'payload'

import config from '../../src/payload.config.js'
import { getOtpCodeFromDb } from '../helpers/otpFromDb'
import {
  captureBookingPosts,
  cleanupExceptions,
  cleanupSeedData,
  ensureWeeklyHoursAllWeek,
  getDefaultResourceId,
  gotoBookingDate,
  seedClosedDay,
  seedService,
  trackBooking,
  uniqueFutureDate,
  uniqueXffHeaders,
} from '../helpers/seed-booking'
import { seedTestUser, testUser } from '../helpers/seedUser'

/**
 * P2 surfaces e2e (spec 006 US1 / 002 US6 / 010 i18n / 015 FR-1505, T1530):
 * waitlist join on a deterministic empty grid (closed-day exception), admin
 * sees the composite `items` in approvals (OPERATOR+), booking-flow keys in
 * ru/en (014 i18n).
 */
test.describe('P2 surfaces: waitlist / admin / i18n (015 US5-7)', () => {
  let resourceId = ''

  test.beforeAll(async () => {
    const payload = await getPayload({ config })
    resourceId = await getDefaultResourceId(payload)
    await ensureWeeklyHoursAllWeek(payload, resourceId)
    await seedTestUser()
  })

  test.afterAll(async () => {
    const payload = await getPayload({ config })
    await cleanupExceptions(payload)
    await cleanupSeedData(payload)
  })

  test('waitlist join on a deterministic empty grid (closed day, spec 006 US1)', async ({ page }) => {
    test.setTimeout(90_000)
    const payload = await getPayload({ config })
    await page.setExtraHTTPHeaders(uniqueXffHeaders())
    const primary = await seedService(payload, { durationMin: 60, price: 25 })
    const closedDate = uniqueFutureDate()
    await seedClosedDay(payload, resourceId, closedDate)

    // Wait for client hydration (initial useEffect availability fetch) before
    // changing the date input — otherwise SSR input accepts .fill() before
    // React attaches onChange in dev mode.
    await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/availability')),
      page.goto(`/book/${primary.slug}`),
    ])
    await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/availability') && r.url().includes(closedDate)),
      page.getByTestId('booking-date').fill(closedDate),
    ])
    await expect(page.getByTestId('waitlist-form')).toBeVisible()
    await page.locator('#wl-name').fill('Waitlist QA')
    await page.locator('#wl-phone').fill('+79160000051')
    await page.locator('#wl-email').fill('waitlist-e2e@example.com')
    await page.getByTestId('waitlist-form').getByRole('button').click()
    await expect(page.getByTestId('waitlist-status')).toBeVisible()
  })

  test('admin approvals show the composite items (OPERATOR+; 014 US5)', async ({ page }) => {
    test.setTimeout(120_000)
    const payload = await getPayload({ config })
    await page.setExtraHTTPHeaders(uniqueXffHeaders())
    // OUT_CALL primary → PENDING_APPROVAL → visible on the approvals surface
    const outCall = await seedService(payload, { durationMin: 60, price: 50, outCall: true, title: 'E2E OutCall Composite' })
    const second = await seedService(payload, { durationMin: 15, price: 10 })
    const { login } = await import('../helpers/login')
    const date = uniqueFutureDate()

    await gotoBookingDate(page, outCall.slug, date)
    await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/availability') && r.url().includes('items=')),
      page.getByTestId(`addon-${second.id}`).check(),
    ])
    await page.getByTestId('slot-option').first().click()
    await page.getByTestId('customer-name').fill('Approvals QA')
    await page.getByTestId('customer-phone').fill('+79160000052')
    await page.getByTestId('customer-email').fill('approvals-e2e@example.com')
    const capture = captureBookingPosts(page)
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

    // OWNER login through the admin UI (canonical helper — waits for the real
    // dashboard, not just any /admin URL) → cookie authorizes /api/approvals
    await login({ page, user: testUser })

    const approvalsRes = await page.request.get('/api/approvals')
    expect(approvalsRes.status()).toBe(200)
    const approvalsJson = (await approvalsRes.json()) as {
      approvals: Array<{ reservationId: number; items: Array<{ productId: string; title: string; addOn: boolean }> | null }>
    }
    const ours = approvalsJson.approvals.find((a) => a.reservationId === booking.reservationId)
    expect(ours).toBeTruthy()
    expect(ours?.items?.length).toBe(2)
    expect(ours?.items?.[0].productId).toBe(outCall.id)
  })

  test('booking-flow i18n: composite keys exist in ru and en (spec 010 / 014)', async ({ page }) => {
    const payload = await getPayload({ config })
    await page.setExtraHTTPHeaders(uniqueXffHeaders())
    const primary = await seedService(payload, { durationMin: 60, price: 25 })
    // The add-on block renders only when compatible add-ons exist — seed one.
    const addOn = await seedService(payload, { addOn: true, durationMin: 0, price: 0 })

    await page.goto(`/ru/book/${primary.slug}`)
    await expect(page.getByTestId('addon-block')).toBeVisible()
    await expect(page.getByTestId('addon-block')).toContainText('Добавить к визиту')
    await expect(page.getByTestId('basket-total')).toContainText('Итого')
    void addOn

    await page.goto(`/en/book/${primary.slug}`)
    await expect(page.getByTestId('addon-block')).toContainText('Add to your visit')
    await expect(page.getByTestId('basket-total')).toContainText('Total')
  })
})
