/**
 * Booking Kernel Application Service (T018, T019, T020)
 * Requirements: FR-307, FR-309, FR-337, FR-338, FR-339, INV-004, INV-010, INV-014, INV-015
 * Standards: NIST SP 800-218 SSDF & ISO/IEC/IEEE 12207:2017
 */

import { randomBytes, createHash } from 'node:crypto';
import { prisma } from '../db/prisma';
import { logger } from '../telemetry/logger';
import { acquireResourceSlotLock } from '../booking/advisoryLock';
import { calculateEffectiveBuffers } from '../booking/windows';
import { validateCustomerContact } from '../booking/lock';
import { resolveServicePrice } from '../../config/currency-registry';
import { HTML_TAG_REGEX } from '../../config/shop.config';
import { StaffActorContext } from '../security/staffRbac';
import { emitAuditEvent } from '../security/staffAuth';

export class SlotConflictError extends Error {
  constructor(message = 'Selected slot has just been taken by another customer') {
    super(message);
    this.name = 'SlotConflictError';
  }
}

export class CancellationError extends Error {
  constructor(message: string, public statusCode = 400) {
    super(message);
    this.name = 'CancellationError';
  }
}

export interface CreateBookingParams {
  serviceId: string;
  professionalId?: string;
  fulfillmentMode: 'IN_CALL' | 'OUT_CALL';
  serviceAddress?: string | null;
  startsAt: Date;
  customerName: string;
  customerContact: string;
  customerNote?: string | null;
  idempotencyKey?: string;
}

export interface CreateBookingResult {
  bookingId: string;
  orderId: string;
  orderNumber: string;
  serviceTitle: string;
  fulfillmentMode: 'IN_CALL' | 'OUT_CALL';
  startsAt: string;
  endsAt: string;
  status: 'PENDING' | 'CONFIRMED';
  confirmationStatus: string;
  servicePriceMinor: number;
  travelFeeMinor: number;
  totalMinor: number;
  currency: string;
  serviceAddress: string | null;
  cancellationToken: string; // Returned ONCE to customer for GET-safe cancellation preview
}

export async function createBooking(params: CreateBookingParams): Promise<CreateBookingResult> {
  const {
    serviceId,
    professionalId,
    fulfillmentMode,
    serviceAddress,
    startsAt,
    customerName,
    customerContact,
    customerNote,
  } = params;

  // 1. Sanitize text inputs against stored XSS (INV-010)
  if (HTML_TAG_REGEX.test(customerName) || (customerNote && HTML_TAG_REGEX.test(customerNote))) {
    throw new Error('HTML tags are strictly prohibited in customer name and notes');
  }
  if (serviceAddress && HTML_TAG_REGEX.test(serviceAddress)) {
    throw new Error('HTML tags are strictly prohibited in service address');
  }

  // 2. Validate contact
  const contactValidation = validateCustomerContact(customerContact);
  if (!contactValidation.valid) {
    throw new Error(contactValidation.error || 'Invalid customer contact');
  }

  // 3. Load ShopSettings and Item
  const settings = await prisma.shopSettings.findUnique({ where: { id: 1 } });
  if (!settings || !settings.currencyConfirmed) {
    throw new Error('Store currency has not been confirmed by owner; booking unavailable');
  }

  const item = await prisma.item.findFirst({
    where: { id: serviceId, itemType: 'SERVICE', isActive: true },
  });
  if (!item) {
    throw new Error(`Active service not found: ${serviceId}`);
  }

  // 4. Validate fulfillment mode
  if (fulfillmentMode === 'IN_CALL') {
    if (!item.inCallEnabled) {
      throw new Error(`In-studio visits (IN_CALL) are not enabled for service '${item.title}'`);
    }
    if (!settings.businessServiceAddress || settings.businessServiceAddress.trim() === '') {
      throw new Error('Business studio address is not configured for in-studio bookings');
    }
    if (serviceAddress && serviceAddress.trim().length > 0) {
      throw new Error('Customer serviceAddress must not be provided for IN_CALL bookings');
    }
  } else if (fulfillmentMode === 'OUT_CALL') {
    if (!item.outCallEnabled) {
      throw new Error(`Professional visits (OUT_CALL) are not enabled for service '${item.title}'`);
    }
    if (!serviceAddress || serviceAddress.trim().length < 5) {
      throw new Error('Customer service address is required for OUT_CALL bookings (minimum 5 characters)');
    }
  } else {
    throw new Error(`Invalid fulfillment mode: ${fulfillmentMode}`);
  }

  // 5. Resolve resourceId
  let resourceId = 'default_master';
  if (professionalId) {
    const profile = await prisma.professionalProfile.findFirst({
      where: {
        OR: [{ id: professionalId }, { slug: professionalId }],
        isPublished: true,
        staffMember: { active: true },
      },
      include: { staffMember: true },
    });
    if (profile?.staffMember?.resourceId) {
      resourceId = profile.staffMember.resourceId;
    }
  }

  // 6. Calculate windows and effective buffers (FR-309, FR-338)
  const durationMin = item.durationMin || 60;
  const { effectiveBufferBeforeMin, effectiveBufferAfterMin } = calculateEffectiveBuffers({
    fulfillmentMode,
    bufferBeforeMin: item.bufferBeforeMin,
    bufferAfterMin: item.bufferAfterMin,
    outCallTravelBeforeMin: item.outCallTravelBeforeMin,
    outCallTravelAfterMin: item.outCallTravelAfterMin,
  });

  const appointmentStartTime = new Date(startsAt.getTime());
  const appointmentEndTime = new Date(appointmentStartTime.getTime() + durationMin * 60 * 1000);
  const startTime = new Date(appointmentStartTime.getTime() - effectiveBufferBeforeMin * 60 * 1000);
  const endTime = new Date(appointmentEndTime.getTime() + effectiveBufferAfterMin * 60 * 1000);
  const totalDurationMin = durationMin + effectiveBufferBeforeMin + effectiveBufferAfterMin;

  // 7. Calculate server-side price (FR-339)
  const pricing = resolveServicePrice(item, fulfillmentMode, settings.currency);

  // 8. Generate 32-byte cancellation token (INV-014)
  const rawCancellationToken = randomBytes(32).toString('hex');
  const cancellationTokenHash = createHash('sha256').update(rawCancellationToken).digest('hex');

  // 9. Execute transaction under advisory lock
  const bookingResult = await prisma.$transaction(async (tx) => {
    await acquireResourceSlotLock(tx, resourceId);

    const now = new Date();

    // Check overlap with active BOOKED or active HELD
    const conflict = await tx.slotReservation.findFirst({
      where: {
        resourceId,
        startTime: { lt: endTime },
        endTime: { gt: startTime },
        AND: [
          {
            OR: [
              { status: 'BOOKED' },
              {
                status: 'HELD',
                OR: [{ holdExpiresAt: null }, { holdExpiresAt: { gt: now } }],
              },
            ],
          },
        ],
      },
    });

    if (conflict) {
      throw new SlotConflictError('Selected slot has just been taken by another customer');
    }

    // Determine status & hold semantics (FR-337, FR-338)
    const isOutCall = fulfillmentMode === 'OUT_CALL';
    const requireApproval = isOutCall || settings.requireStaffApprovalForInCall;

    const initialReservationStatus = requireApproval ? 'HELD' : 'BOOKED';
    const initialConfirmationStatus = requireApproval ? 'PENDING_STAFF_REVIEW' : 'STAFF_APPROVED';
    // OUT_CALL pending approval gets holdExpiresAt = null so it does not auto-cancel (FR-338)
    const holdExpiresAt = null;

    const addressSnapshot = isOutCall ? serviceAddress!.trim() : settings.businessServiceAddress;

    const randomSuffix = Math.random().toString(36).substring(2, 8).toUpperCase();
    const orderNumber = `ORD-${Date.now()}-${randomSuffix}`;

    const order = await tx.order.create({
      data: {
        orderNumber,
        status: 'PENDING',
        totalMinor: pricing.totalMinor,
        currency: pricing.currency,
        customerName: customerName.trim(),
        customerPhone: contactValidation.type === 'PHONE' ? contactValidation.normalized : null,
        customerEmail: contactValidation.type === 'EMAIL' ? contactValidation.normalized : null,
        customerNotes: customerNote ? customerNote.trim() : null,
        confirmationStatus: initialConfirmationStatus as any,
        paymentType: 'PAY_ON_SITE',
        scheduleVersion: 1,
        items: {
          create: [
            {
              itemId: item.id,
              titleSnapshot: item.title,
              currency: pricing.currency,
              durationMin,
              quantity: 1,
              priceMinor: pricing.servicePriceMinor,
            },
          ],
        },
      },
    });

    const reservation = await tx.slotReservation.create({
      data: {
        resourceId,
        itemId: item.id,
        orderId: order.id,
        startTime,
        endTime,
        totalDurationMin,
        status: initialReservationStatus as any,
        holdExpiresAt,
        fulfillmentMode,
        servicePriceMinor: pricing.servicePriceMinor,
        travelFeeMinor: pricing.travelFeeMinor,
        serviceAddressSnapshot: addressSnapshot,
        appointmentStartTime,
        appointmentEndTime,
        bufferBeforeMin: effectiveBufferBeforeMin,
        bufferAfterMin: effectiveBufferAfterMin,
        cancellationTokenHash,
        cancellationTokenExpiresAt: appointmentStartTime,
      },
    });

    return { order, reservation };
  });

  await emitAuditEvent({
    action: 'BOOKING_CREATED',
    actorId: 'PUBLIC_BOOKING_PORTAL',
    aggregateType: 'BOOKING',
    aggregateId: bookingResult.reservation.id,
    reason: `Customer booked ${item.title} (${fulfillmentMode})`,
    metadataJson: {
      fulfillmentMode,
      totalMinor: pricing.totalMinor,
      currency: pricing.currency,
    },
  });

  return {
    bookingId: bookingResult.reservation.id,
    orderId: bookingResult.order.id,
    orderNumber: bookingResult.order.orderNumber,
    serviceTitle: item.title,
    fulfillmentMode,
    startsAt: appointmentStartTime.toISOString(),
    endsAt: appointmentEndTime.toISOString(),
    status: bookingResult.reservation.status === 'BOOKED' ? 'CONFIRMED' : 'PENDING',
    confirmationStatus: bookingResult.order.confirmationStatus,
    servicePriceMinor: pricing.servicePriceMinor,
    travelFeeMinor: pricing.travelFeeMinor,
    totalMinor: pricing.totalMinor,
    currency: pricing.currency,
    serviceAddress: bookingResult.reservation.serviceAddressSnapshot,
    cancellationToken: rawCancellationToken,
  };
}

export interface CancelBookingParams {
  bookingId: string;
  token?: string;
  staffActor?: StaffActorContext;
  reason?: string;
}

export async function cancelBooking(params: CancelBookingParams): Promise<void> {
  const { bookingId, token, staffActor, reason } = params;

  if (!token && !staffActor) {
    throw new CancellationError('Unauthorized: cancellation token or staff authentication required', 401);
  }

  await prisma.$transaction(async (tx) => {
    const reservation = await tx.slotReservation.findFirst({
      where: {
        OR: [{ id: bookingId }, { orderId: bookingId }],
      },
      include: {
        item: true,
        order: true,
      },
    });

    if (!reservation) {
      throw new CancellationError('Booking reservation not found', 404);
    }

    if (reservation.status === 'RELEASED') {
      return; // Idempotent success
    }

    await acquireResourceSlotLock(tx, reservation.resourceId);

    const now = new Date();

    // Customer token verification path
    if (token) {
      const providedHash = createHash('sha256').update(token.trim()).digest('hex');
      if (reservation.cancellationTokenHash !== providedHash) {
        throw new CancellationError('Invalid or unrecognised cancellation token', 403);
      }

      if (reservation.cancellationTokenConsumedAt) {
        throw new CancellationError('Cancellation token has already been consumed', 409);
      }

      if (reservation.cancellationTokenRevokedAt) {
        throw new CancellationError('Cancellation token has been revoked', 409);
      }

      if (reservation.cancellationTokenExpiresAt && now > reservation.cancellationTokenExpiresAt) {
        throw new CancellationError('Cancellation token has expired', 410);
      }

      // Check cancellation cutoff hours
      const cutoffHours = reservation.item?.cancellationCutoffHours || 3;
      const apptStart = reservation.appointmentStartTime || reservation.startTime;
      const cutoffDeadline = new Date(apptStart.getTime() - cutoffHours * 60 * 60 * 1000);

      if (now > cutoffDeadline) {
        throw new CancellationError(
          `Cancellation window has passed (must cancel at least ${cutoffHours} hours in advance)`,
          400
        );
      }

      // Transition to RELEASED and mark token consumed
      await tx.slotReservation.update({
        where: { id: reservation.id },
        data: {
          status: 'RELEASED',
          cancellationTokenConsumedAt: now,
        },
      });

      await tx.order.update({
        where: { id: reservation.orderId },
        data: {
          status: 'CANCELLED',
          cancellationReason: 'CLIENT_DECLINED',
        },
      });

      await emitAuditEvent({
        action: 'BOOKING_CANCELLED_BY_CUSTOMER',
        actorId: 'CUSTOMER_CANCELLATION_LINK',
        aggregateType: 'BOOKING',
        aggregateId: reservation.id,
        reason: reason || 'Customer submitted token-verified cancellation',
        metadataJson: { orderId: reservation.orderId },
      });
    } else if (staffActor) {
      // Staff cancellation path
      await tx.slotReservation.update({
        where: { id: reservation.id },
        data: {
          status: 'RELEASED',
          cancellationTokenRevokedAt: now,
        },
      });

      await tx.order.update({
        where: { id: reservation.orderId },
        data: {
          status: 'CANCELLED',
          cancellationReason: 'ADMIN_CANCELLED',
        },
      });

      await emitAuditEvent({
        action: 'BOOKING_CANCELLED_BY_STAFF',
        actorId: staffActor.actorId,
        actorRole: staffActor.actorRole,
        aggregateType: 'BOOKING',
        aggregateId: reservation.id,
        reason: reason || `Staff cancelled booking for order ${reservation.order.orderNumber}`,
        metadataJson: { orderId: reservation.orderId },
      });
    }
  });
}
