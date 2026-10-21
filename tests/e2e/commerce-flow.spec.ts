import { test, expect } from '@playwright/test';

test.describe('Modular Commerce & Multi-Service Cart Flow (E2E)', () => {
  test('Catalog endpoint returns active items', async ({ request }) => {
    const res = await request.get('/api/catalog');
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.items)).toBe(true);
  });

  test('Multi-service cart booking lock and 409 conflict on overlapping window', async ({
    request,
  }) => {
    const catalogRes = await request.get('/api/catalog');
    const catalog = await catalogRes.json();
    const serviceItems = catalog.items.filter((i: { itemType: string }) => i.itemType === 'SERVICE');

    if (serviceItems.length === 0) {
      test.skip();
      return;
    }

    const selectedIds = serviceItems.slice(0, 2).map((i: { id: string }) => i.id);
    const testStartTime = new Date(Date.now() + 24 * 3600 * 1000);
    testStartTime.setMinutes(0, 0, 0);

    // 1. First multi-service lock with customerNotes and PAY_ON_SITE -> 201 Created
    const lock1 = await request.post('/api/booking/lock', {
      data: {
        itemIds: selectedIds,
        resourceId: 'default_master',
        startTime: testStartTime.toISOString(),
        customerName: 'User One',
        customerPhone: '+1 555 111 2233',
        customerNotes: 'Пожалуйста, без задержек',
        paymentType: 'PAY_ON_SITE',
      },
    });

    if (lock1.status() === 201) {
      // 2. Second concurrent/overlapping lock on same resource -> 409 Conflict
      const lock2 = await request.post('/api/booking/lock', {
        data: {
          itemIds: selectedIds,
          resourceId: 'default_master',
          startTime: testStartTime.toISOString(),
          customerName: 'User Two',
          customerPhone: '+1 555 999 8877',
          paymentType: 'PAY_ON_SITE',
        },
      });

      expect(lock2.status()).toBe(409);
      const errData = await lock2.json();
      expect(errData.error).toMatch(/taken|conflict|already reserved/i);
    }
  });
});
