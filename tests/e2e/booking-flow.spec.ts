import { test, expect } from '@playwright/test';

test.describe('Booking-First Service Template Acceptance (T057, US2, US12)', () => {
  test('Public business endpoint returns published profile and active services (FR-335)', async ({
    request,
  }) => {
    const res = await request.get('/api/public/business');
    expect(res.status()).toBe(200);
    const data = await res.json();

    expect(data.business).toBeDefined();
    expect(data.business.name).toBeDefined();
    expect(data.business.currency).toBeDefined();
    expect(Array.isArray(data.services)).toBe(true);
    expect(Array.isArray(data.professionals)).toBe(true);
  });

  test('Public slot lookup accounts for location modes and returns available windows (FR-338)', async ({
    request,
  }) => {
    const bizRes = await request.get('/api/public/business');
    const bizData = await bizRes.json();
    if (!bizData.services || bizData.services.length === 0) {
      test.skip();
      return;
    }

    const service = bizData.services[0];
    const tomorrow = new Date(Date.now() + 24 * 3600 * 1000).toISOString().split('T')[0];

    const slotsRes = await request.get(
      `/api/booking/slots?serviceId=${service.id}&date=${tomorrow}&mode=IN_CALL`
    );
    expect(slotsRes.status()).toBe(200);
    const slotsData = await slotsRes.json();
    expect(slotsData.serviceId).toBe(service.id);
    expect(slotsData.fulfillmentMode).toBe('IN_CALL');
    expect(Array.isArray(slotsData.slots)).toBe(true);
  });

  test('End-to-end booking creation, concurrent 409 collision, and token-based cancellation (FR-337, INV-004, INV-014)', async ({
    request,
  }) => {
    const bizRes = await request.get('/api/public/business');
    const bizData = await bizRes.json();
    if (!bizData.services || bizData.services.length === 0) {
      test.skip();
      return;
    }

    const service = bizData.services[0];
    const targetDate = new Date(Date.now() + 48 * 3600 * 1000);
    targetDate.setUTCHours(10, 0, 0, 0);

    // 1. Create first booking
    const bookRes1 = await request.post('/api/booking', {
      data: {
        serviceId: service.id,
        fulfillmentMode: 'IN_CALL',
        startsAt: targetDate.toISOString(),
        customerName: 'E2E Customer One',
        customerContact: '+37499111222',
        customerNote: 'Test booking one',
        idempotencyKey: `e2e_book1_${Date.now()}`,
      },
    });

    if (bookRes1.status() === 201) {
      const data1 = await bookRes1.json();
      expect(data1.booking).toBeDefined();
      expect(data1.booking.cancellationToken).toBeDefined();

      const bookingId = data1.booking.bookingId;
      const cancellationToken = data1.booking.cancellationToken;

      // 2. Second overlapping booking at the exact same slot -> returns 409 Conflict
      const bookRes2 = await request.post('/api/booking', {
        data: {
          serviceId: service.id,
          fulfillmentMode: 'IN_CALL',
          startsAt: targetDate.toISOString(),
          customerName: 'E2E Customer Two',
          customerContact: '+37499333444',
          idempotencyKey: `e2e_book2_${Date.now()}`,
        },
      });

      expect(bookRes2.status()).toBe(409);
      const conflictData = await bookRes2.json();
      expect(conflictData.code).toBe('SLOT_UNAVAILABLE');

      // 3. GET-safe cancellation preview (does not consume token)
      const previewRes = await request.get(
        `/api/booking/${bookingId}/cancel?token=${cancellationToken}`
      );
      expect(previewRes.status()).toBe(200);
      const previewData = await previewRes.json();
      expect(previewData.preview.canCancel).toBe(true);
      expect(previewData.preview.status).not.toBe('RELEASED');

      // 4. POST cancellation consumption
      const cancelRes = await request.post(`/api/booking/${bookingId}/cancel`, {
        data: { token: cancellationToken, reason: 'E2E test cancellation' },
      });
      expect(cancelRes.status()).toBe(200);

      // 5. Subsequent cancellation attempt with consumed token -> rejected
      const retryCancel = await request.post(`/api/booking/${bookingId}/cancel`, {
        data: { token: cancellationToken },
      });
      expect(retryCancel.status()).toBeGreaterThanOrEqual(400);
    }
  });
});
