/**
 * T090 (FR-425, FR-426): booking boundary hardening.
 * - OUT_CALL without serviceAddress → field-level 400 at the zod boundary.
 * - IN_CALL with serviceAddress → field-level 400.
 * - Mixed service+product cart → MIXED_CART_TYPE with split-orders guidance.
 * - Checkout API is structurally single-item (itemId), so the service-cart
 *   validator is the mixing enforcement point.
 */

jest.mock('@/lib/kernel/bookingService', () => ({
  createBooking: jest.fn().mockResolvedValue({ id: 'bk-1', status: 'HELD', bookingId: 'bk-1' }),
  SlotConflictError: class SlotConflictError extends Error {},
}));

jest.mock('@/lib/kernel/customFieldService', () => ({
  validateAnswersForService: jest.fn().mockResolvedValue({}),
  persistBookingAnswers: jest.fn().mockResolvedValue(undefined),
  CustomFieldValidationError: class CustomFieldValidationError extends Error {
    readonly code = 'FIELD_INVALID';
  },
}));

import { NextRequest } from 'next/server';
import { POST } from '@/app/api/booking/route';
import {
  validateAndBuildServiceCart,
  CartValidationError,
  AuthoritativeServiceItem,
} from '@/lib/booking/cart';

function bookingReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/booking', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

const validBase = {
  serviceId: '11111111-1111-4111-8111-111111111111',
  fulfillmentMode: 'IN_CALL',
  startsAt: '2026-12-01T10:00:00.000Z',
  customerName: 'Тест Клиент',
  customerContact: '+79990000000',
};

describe('FR-425: OUT_CALL requires serviceAddress at the boundary', () => {
  it('rejects OUT_CALL without serviceAddress with field-level 400', async () => {
    const res = await POST(bookingReq({ ...validBase, fulfillmentMode: 'OUT_CALL' }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toHaveProperty('serviceAddress');
    expect(JSON.stringify(data.error.serviceAddress)).toContain('OUT_CALL');
  });

  it('rejects OUT_CALL with whitespace-only serviceAddress', async () => {
    const res = await POST(
      bookingReq({ ...validBase, fulfillmentMode: 'OUT_CALL', serviceAddress: '   ' })
    );
    // '   ' trims to '' → zod .trim().max(500) yields '' → refine sees falsy → rejected
    expect(res.status).toBe(400);
  });

  it('rejects IN_CALL with serviceAddress (field-level 400)', async () => {
    const res = await POST(
      bookingReq({ ...validBase, serviceAddress: 'ул. Пушкина, д. 1' })
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toHaveProperty('serviceAddress');
  });

  it('accepts OUT_CALL with serviceAddress and passes it to createBooking', async () => {
    const { createBooking } = jest.requireMock('@/lib/kernel/bookingService') as {
      createBooking: jest.Mock;
    };
    const res = await POST(
      bookingReq({
        ...validBase,
        fulfillmentMode: 'OUT_CALL',
        serviceAddress: 'ул. Пушкина, д. 1',
      })
    );
    expect(res.status).toBe(201);
    expect(createBooking).toHaveBeenCalledWith(
      expect.objectContaining({ fulfillmentMode: 'OUT_CALL', serviceAddress: 'ул. Пушкина, д. 1' })
    );
  });

  it('accepts IN_CALL without serviceAddress', async () => {
    const res = await POST(bookingReq({ ...validBase }));
    expect(res.status).toBe(201);
  });
});

describe('FR-426: mixed service+product cart blocked with split guidance', () => {
  const svc: AuthoritativeServiceItem = {
    id: 'svc-1',
    title: 'Стрижка',
    priceMinor: 5000,
    currency: 'USD',
    itemType: 'SERVICE',
    durationMin: 30,
    isActive: true,
  };
  const product: AuthoritativeServiceItem = {
    id: 'prod-1',
    title: 'Шампунь',
    priceMinor: 1500,
    currency: 'USD',
    itemType: 'PRODUCT',
    durationMin: null as unknown as number,
    isActive: true,
  };

  it('throws MIXED_CART_TYPE when a PRODUCT item is requested alongside services', () => {
    expect(() => validateAndBuildServiceCart(['svc-1', 'prod-1'], [svc, product])).toThrow(
      CartValidationError
    );
    try {
      validateAndBuildServiceCart(['svc-1', 'prod-1'], [svc, product]);
    } catch (err) {
      const e = err as CartValidationError;
      expect(e.code).toBe('MIXED_CART_TYPE');
      expect(e.message).toMatch(/separate order/i);
    }
  });

  it('throws MIXED_CART_TYPE for a lone PRODUCT item (homogeneity enforced)', () => {
    try {
      validateAndBuildServiceCart(['prod-1'], [product]);
      throw new Error('expected to throw');
    } catch (err) {
      const e = err as CartValidationError;
      expect(e.code).toBe('MIXED_CART_TYPE');
    }
  });

  it('still rejects unknown/inactive items as UNAVAILABLE_CART_ITEM', () => {
    try {
      validateAndBuildServiceCart(['ghost'], [svc]);
      throw new Error('expected to throw');
    } catch (err) {
      expect((err as CartValidationError).code).toBe('UNAVAILABLE_CART_ITEM');
    }
  });

  it('accepts a homogeneous SERVICE cart', () => {
    const cart = validateAndBuildServiceCart(['svc-1'], [svc]);
    expect(cart.itemIds).toEqual(['svc-1']);
  });
});
