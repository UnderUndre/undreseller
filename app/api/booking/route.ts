import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createBooking, SlotConflictError } from '@/lib/kernel/bookingService';
import { logger } from '@/lib/telemetry/logger';

const createBookingSchema = z
  .object({
    serviceId: z.string().uuid(),
    professionalId: z.string().optional(),
    fulfillmentMode: z.enum(['IN_CALL', 'OUT_CALL']),
    serviceAddress: z.string().trim().max(500).optional(),
    startsAt: z.string().datetime(),
    customerName: z.string().trim().min(1).max(120),
    customerContact: z.string().trim().min(3).max(160),
    customerNote: z.string().trim().max(500).optional(),
    idempotencyKey: z.string().trim().min(8).max(128).optional(),
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
    const body = await req.json();
    const parsed = createBookingSchema.safeParse(body);
    if (!parsed.success) {
      // Field-level validation errors (FR-425): shape { serviceAddress: [...] }
      return NextResponse.json(
        { error: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { startsAt, ...rest } = parsed.data;

    const result = await createBooking({
      ...rest,
      startsAt: new Date(startsAt),
    });

    return NextResponse.json({ booking: result }, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof SlotConflictError) {
      return NextResponse.json({ error: err.message, code: 'SLOT_UNAVAILABLE' }, { status: 409 });
    }
    logger.error('Failed to create booking', { error: String(err) });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 400 }
    );
  }
}
