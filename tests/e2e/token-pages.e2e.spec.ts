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
  reservationRow,
  seedService,
  trackBooking,
  uniqueFutureDate,
  uniqueXffHeaders,
} from '../helpers/seed-booking'

/**
 * One-time token pages e2e (spec 003 US3/US4 / 014 composite reschedule /
 * 015 FR-1503, T1520): scanner-safe GET pages + one-time semantics +
 * composite container-grid reschedule (fix AG-F5). The raw reschedule token
 * exists only in the 201 body — captured via route interception.
 */
test.describe('token pages (003 US3/US4 / 015 US3)', () => {
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

  async function bookViaUi(
    page: import('@playwright/test').Page,
    primarySlug: string,
    addOnIds: string[],
    email: string,
    payload: import('payload').Payload,
  ): Promise<NonNullable<ReturnType<typeof captureBookingPosts>['last']>> {
    await page.setExtraHTTPHeaders(uniqueXffHeaders())
    const capture = captureBookingPosts(page)
    await gotoBookingDate(page, primarySlug, uniqueFutureDate())
    for (const addOnId of addOnIds) {
      await Promise.all([
        page.waitForResponse((r) => r.url().includes('/api/availability') && r.url().includes('items=')),
        page.getByTestId(`addon-${addOnId}`).check(),
      ])
    }
    await page.getByTestId('slot-option').first().click()
    await page.getByTestId('customer-name').fill('Token QA')
    await page.getByTestId('customer-phone').fill('+79160000031')
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
    const row = await reservationRow(payload, booking.reservationId)
    expect(row?.status, 'booking must be active right after the OTP flow').toBe('BOOKED')
    return booking
  }

  test('cancel link: one-time semantics + honest replay 409 UX (TC-003-011 canon)', async ({ page }) => {
    test.setTimeout(90_000)
    const payload = await getPayload({ config })
    const primary = await seedService(payload, { durationMin: 60, price: 25 })
    const booking = await bookViaUi(page, primary.slug, [], 'token-cancel-e2e@example.com', payload)

    await page.goto(`/booking/cancel?bookingId=${booking.reservationId}&token=${booking.cancelToken}`)
    await expect(page.getByTestId('cancel-confirm')).toBeVisible()
    await page.getByTestId('cancel-confirm-button').click()
    await expect(page.getByTestId('cancel-status')).toContainText('cancelled')

    // Scanner-safe GET never consumed the token — the REPLAY hits the
    // page-level RELEASED branch (the form is not rendered for a released
    // booking; the page itself carries the honest message).
    await page.goto(`/booking/cancel?bookingId=${booking.reservationId}&token=${booking.cancelToken}`)
    await expect(page.getByText('This booking is already cancelled.')).toBeVisible()
  })

  test('composite reschedule: picker renders the CONTAINER grid and moves the booking (fix AG-F5)', async ({ page }) => {
    test.setTimeout(120_000)
    const payload = await getPayload({ config })
    const primary = await seedService(payload, { durationMin: 60, price: 25 })
    const second = await seedService(payload, { durationMin: 15, price: 10 })
    const booking = await bookViaUi(
      page,
      primary.slug,
      [second.id],
      'token-reschedule-e2e@example.com',
      payload,
    )

    await page.goto(`/booking/reschedule?bookingId=${booking.reservationId}&token=${booking.rescheduleToken}`)
    await expect(page.getByTestId('reschedule-picker')).toBeVisible()
    const newDate = uniqueFutureDate()
    const [gridResponse] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/availability') && r.url().includes('items=')),
      page.getByTestId('reschedule-date').fill(newDate),
    ])
    // The picker grid is the CONTAINER grid (Σ 75), not the 60-min primary grid
    expect(((await gridResponse.json()) as { totalDurationMin?: number }).totalDurationMin).toBe(75)

    await page.getByTestId('reschedule-slot').first().click()
    await expect(page.getByTestId('reschedule-status')).toContainText('Moved to')
  })

  test('acknowledge link: one-click CAS acknowledgement', async ({ page }) => {
    test.setTimeout(90_000)
    const payload = await getPayload({ config })
    const primary = await seedService(payload, { durationMin: 60, price: 25 })
    const booking = await bookViaUi(page, primary.slug, [], 'token-ack-e2e@example.com', payload)

    await page.goto(`/booking/acknowledge?token=${booking.accessToken}`)
    await expect(page.getByTestId('ack-status')).toContainText('Thanks')
  })
})
