/**
 * T050 (FR-632): characterization snapshots of 400-error shapes BEFORE zod@4
 * migration (canon 005 T040). Scope = existing 004/005 surface:
 * booking create, adminSchemas, presign. After T051, T052 asserts these
 * snapshots are byte-identical (any diff = merge blocker, FR-632).
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

jest.mock('@/lib/booking/cart', () => ({
  validateAndBuildServiceCart: jest.fn().mockResolvedValue({
    items: [
      {
        type: 'SERVICE',
        serviceId: '11111111-1111-4111-8111-111111111111',
        priceMinor: 1000,
      },
    ],
  }),
  CartValidationError: class CartValidationError extends Error {},
}));

jest.mock('@/lib/security/staffAuth', () => ({
  authenticateStaff: jest.fn().mockResolvedValue({
    authenticated: true,
    actor: { actorId: 'staff-1', role: 'OPERATOR' },
  }),
  emitAuditEvent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/lib/uploads/presign', () => ({
  createPresignedPut: jest.fn().mockResolvedValue({ url: 'https://s3.test/put', key: 'k' }),
  PresignValidationError: class PresignValidationError extends Error {},
}));

import { NextRequest } from 'next/server';
import { POST as bookingPost } from '@/app/api/booking/route';
import { POST as presignPost } from '@/app/api/admin/uploads/presign/route';
import {
  adminServiceCreateSchema,
  operationalSettingsSchema,
} from '@/lib/validation/adminSchemas';

function jsonReq(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

const validBookingBase = {
  serviceId: '11111111-1111-4111-8111-111111111111',
  fulfillmentMode: 'IN_CALL',
  startsAt: '2026-12-01T10:00:00.000Z',
  customerName: 'Тест Клиент',
  customerContact: '+79990000000',
};

describe('T050: 400-shape characterization (pre zod@4)', () => {
  it('booking create: valid IN_CALL → not a 400', async () => {
    const res = await bookingPost(jsonReq('http://localhost/api/booking', validBookingBase));
    expect(res.status).toBe(201);
  });

  it('booking create: OUT_CALL without serviceAddress', async () => {
    const res = await bookingPost(
      jsonReq('http://localhost/api/booking', {
        ...validBookingBase,
        fulfillmentMode: 'OUT_CALL',
      })
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchSnapshot('booking-outcall-no-address');
  });

  it('booking create: IN_CALL with serviceAddress', async () => {
    const res = await bookingPost(
      jsonReq('http://localhost/api/booking', {
        ...validBookingBase,
        serviceAddress: 'ул. Тестовая, 1',
      })
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchSnapshot('booking-incall-with-address');
  });

  it('booking create: bad uuid', async () => {
    const res = await bookingPost(
      jsonReq('http://localhost/api/booking', {
        ...validBookingBase,
        serviceId: 'not-a-uuid',
      })
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchSnapshot('booking-bad-uuid');
  });

  it('adminSchemas: service create invalid (empty body)', () => {
    const parsed = adminServiceCreateSchema.safeParse({});
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.flatten().fieldErrors).toMatchSnapshot('admin-service-create-invalid');
    }
  });

  it('adminSchemas: settings patch invalid (bad operational payload)', () => {
    const parsed = operationalSettingsSchema.safeParse({ slotGridStepMin: 20 });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.flatten().fieldErrors).toMatchSnapshot('admin-settings-patch-invalid');
    }
  });

  it('presign: valid payload → not a 400', async () => {
    const res = await presignPost(
      jsonReq('http://localhost/api/admin/uploads/presign', {
        contentType: 'image/jpeg',
        contentLength: 1024,
        folder: 'portfolio',
        extension: 'jpg',
      })
    );
    expect(res.status).toBe(200);
  });

  it('presign: bad mime (missing contentType)', async () => {
    const res = await presignPost(
      jsonReq('http://localhost/api/admin/uploads/presign', {
        contentLength: 1024,
        folder: 'portfolio',
      })
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchSnapshot('presign-bad-mime');
  });

  it('presign: oversized (negative contentLength)', async () => {
    const res = await presignPost(
      jsonReq('http://localhost/api/admin/uploads/presign', {
        contentType: 'image/jpeg',
        contentLength: -1,
        folder: 'portfolio',
      })
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchSnapshot('presign-oversized');
  });
});
