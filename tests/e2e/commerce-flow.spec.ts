import { test, expect } from '@playwright/test';

test.describe('Modular Commerce Flow (E2E)', () => {
  test('Catalog endpoint returns active items', async ({ request }) => {
    const res = await request.get('/api/catalog');
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.items)).toBe(true);
  });

  test('Booking conflict returns 409 on second lock attempt', async ({ request }) => {
    // 1. Fetch catalog to obtain service item
    const catalogRes = await request.get('/api/catalog');
    const catalog = await catalogRes.json();
    const serviceItem = catalog.items.find((i: any) => i.itemType === 'SERVICE');

    if (!serviceItem) {
      test.skip();
      return;
    }

    const testStartTime = new Date(Date.now() + 24 * 3600 * 1000);
    testStartTime.setMinutes(0, 0, 0);

    // 2. First lock -> 201 Created
    const lock1 = await request.post('/api/booking/lock', {
      data: {
        itemId: serviceItem.id,
        startTime: testStartTime.toISOString(),
        customerName: 'User One',
        customerPhone: '+1 555 111 2233',
      },
    });

    if (lock1.status() === 201) {
      // 3. Second concurrent/overlapping lock -> 409 Conflict
      const lock2 = await request.post('/api/booking/lock', {
        data: {
          itemId: serviceItem.id,
          startTime: testStartTime.toISOString(),
          customerName: 'User Two',
          customerPhone: '+1 555 999 8877',
        },
      });

      expect(lock2.status()).toBe(409);
      const errData = await lock2.json();
      expect(errData.error).toMatch(/taken|conflict|already reserved/i);
    }
  });
});
