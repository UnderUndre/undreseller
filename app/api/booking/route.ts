import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createBooking, SlotConflictError } from '@/lib/kernel/bookingService';
import {
  validateAnswersForService,
  persistBookingAnswers,
  CustomFieldValidationError,
} from '@/lib/kernel/customFieldService';
import { logger } from '@/lib/telemetry/logger';
import {
  enforceRateLimit,
  rateLimitKey,
  isPayloadWithinCap,
  PAYLOAD_CAPS,
} from '@/lib/security/rateLimit';

const createBookingSchema = z
  .object({
    serviceId: z.string().uuid(),
    professionalId: z.string().optional(),
    fulfillmentMode: z.enum(['IN_CALL', 'OUT_CALL']),
    serviceAddress: z.string().trim().max(PAYLOAD_CAPS.SERVICE_ADDRESS_CHARS).optional(),
    startsAt: z.string().datetime(),
    customerName: z.string().trim().min(1).max(120),
    customerContact: z.string().trim().min(3).max(160),
    customerNote: z.string().trim().max(500).optional(),
    idempotencyKey: z.string().trim().min(8).max(128).optional(),
    // US6 custom booking fields (FR-423/434): keyed by field id or key.
    fieldAnswers: z.record(z.union([z.string().max(1000), z.number(), z.boolean()])).optional(),
  })
  // FR-425 (T090): OUT_CALL bookings MUST carry a service address, enforced
  // at the boundary with a field-level error — not deep in the kernel.
  .superRefine((data, ctx) => {
    if (data.fulfillmentMode === 'OUT_CALL' && !data.serviceAddress) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['serviceAddress'],
        message: 'serviceAddress is required for OUT_CALL bookings',
      });
    }
    if (data.fulfillmentMode === 'IN_CALL' && data.serviceAddress) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['serviceAddress'],
        message: 'serviceAddress must not be provided for IN_CALL bookings',
      });
    }
  });

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    // FR-427 (T091): bounded payload — reject oversized bodies before parsing.
    const rawBody = await req.text();
    if (!isPayloadWithinCap(rawBody, PAYLOAD_CAPS.BOOKING_CREATE_BODY_BYTES)) {
      return NextResponse.json({ error: 'Payload Too Large' }, { status: 413 });
    }

    const body = JSON.parse(rawBody);
    const parsed = createBookingSchema.safeParse(body);
    if (!parsed.success) {
      // Field-level validation errors (FR-425): shape { serviceAddress: [...] }
      return NextResponse.json(
        { error: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    // FR-427 (T091): per-contact rate limit on booking create.
    const ip = req.headers.get('x-forwarded-for') || 'anon';
    const rateCheck = enforceRateLimit(
      rateLimitKey('booking_create', parsed.data.customerContact || ip),
      10,
      60 * 1000
    );
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: 'Too many booking attempts. Please try again later.' },
        { status: 429 }
      );
    }

    const { startsAt, fieldAnswers, ...rest } = parsed.data;

    // Validate custom answers BEFORE consuming the slot (US6, FR-434).
    const normalizedAnswers = await validateAnswersForService(rest.serviceId, fieldAnswers);

    const result = await createBooking({
      ...rest,
      startsAt: new Date(startsAt),
    });

    await persistBookingAnswers(result.bookingId, normalizedAnswers);

    return NextResponse.json({ booking: result }, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof SlotConflictError) {
      return NextResponse.json({ error: err.message, code: 'SLOT_UNAVAILABLE' }, { status: 409 });
    }
    if (err instanceof CustomFieldValidationError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 422 });
    }
    logger.error('Failed to create booking', { error: String(err) });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 400 }
    );
  }
}
