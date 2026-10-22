import { createHash } from 'node:crypto';
import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/telemetry/logger';
import { acquireResourceSlotLock } from './advisoryLock';
import { dispatchStaffOrderPagerCard } from '@/lib/bot/staffBot';
import {
  validateAndBuildServiceCart,
  sanitizeCustomerNotes,
  CartValidationError,
  AuthoritativeServiceItem,
} from './cart';

export class SlotConflictError extends Error {
  constructor(message = 'Selected slot has just been taken by another customer') {
    super(message);
    this.name = 'SlotConflictError';
  }
}

export class ClientBlacklistedError extends Error {
  constructor(message = 'Access restricted') {
    super(message);
    this.name = 'ClientBlacklistedError';
  }
}

export class RescheduleTokenError extends Error {
  constructor(message = 'Invalid, expired, or already consumed reschedule token') {
    super(message);
    this.name = 'RescheduleTokenError';
  }
}

export const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
export const MAX_OTP_ATTEMPTS = 5;
export const PHONE_RISK_EXPIRY_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

export function normalizePhoneE164(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = String(phone).replace(/[^\d]/g, '');
  if (!digits || digits.length < 7 || digits.length > 15) {
    return null;
  }
  // Российский формат: 89991234567 → +79991234567 (заменяем ведущую 8 на 7)
  let normalized = digits;
  if (normalized.length === 11 && normalized.startsWith('8')) {
    normalized = '7' + normalized.slice(1);
  }
  return `+${normalized}`;
}

export function hashSecretValue(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export interface BlacklistContactRecord {
  platform: 'TELEGRAM' | 'WHATSAPP' | string;
  externalId: string;
  customerId?: string | null;
  isBlocked: boolean;
  phoneVerifiedAt?: Date | null;
  phoneVerificationMethod?: string | null;
  phoneRiskExpiresAt?: Date | null;
  requiresManualReview?: boolean;
}

export interface BlacklistEvaluationResult {
  action: 'ALLOW' | 'BLOCK_403' | 'MANUAL_REVIEW' | 'EXPIRED_RISK_CLEARED';
  reason?: string;
}

export function evaluateBlacklistIdentity(params: {
  customerTgId?: string | null;
  customerId?: string | null;
  normalizedPhone?: string | null;
  phoneOwnershipVerified?: boolean;
  contacts: BlacklistContactRecord[];
  now?: Date;
}): BlacklistEvaluationResult {
  const {
    customerTgId,
    customerId,
    normalizedPhone,
    phoneOwnershipVerified,
    contacts,
    now = new Date(),
  } = params;

  // 1. Check permanent block by stable identity (Telegram ID or customerId)
  for (const contact of contacts) {
    if (!contact.isBlocked) continue;

    if (customerTgId && contact.platform === 'TELEGRAM' && contact.externalId === customerTgId) {
      return { action: 'BLOCK_403', reason: 'TELEGRAM_ID_BLACKLISTED' };
    }

    if (customerId && contact.customerId && contact.customerId === customerId) {
      return { action: 'BLOCK_403', reason: 'CUSTOMER_ID_BLACKLISTED' };
    }
  }

  // 2. Check phone-based block or risk marker
  if (normalizedPhone) {
    const phoneContact = contacts.find(
      (c) => c.platform === 'WHATSAPP' && c.externalId === normalizedPhone
    );

    if (phoneContact && phoneContact.isBlocked) {
      // Check 90-day risk marker expiration
      if (
        phoneContact.phoneRiskExpiresAt &&
        phoneContact.phoneRiskExpiresAt.getTime() <= now.getTime()
      ) {
        return { action: 'EXPIRED_RISK_CLEARED', reason: 'PHONE_RISK_EXPIRED_90D' };
      }

      // If caller proved new ownership for a recycled/unlinked number via OTP rebind
      if (
        phoneOwnershipVerified &&
        customerId &&
        phoneContact.customerId &&
        phoneContact.customerId !== customerId
      ) {
        return { action: 'ALLOW', reason: 'RECYCLED_PHONE_REBOUND_TO_NEW_OWNER' };
      }

      // If phone record is explicitly an unverified phone-only match or flagged for manual review
      if (
        phoneContact.requiresManualReview ||
        phoneContact.phoneVerificationMethod === 'UNVERIFIED_PHONE_ONLY'
      ) {
        return { action: 'MANUAL_REVIEW', reason: 'PHONE_ONLY_UNVERIFIED_MATCH' };
      }

      // If phone was blocked under a different customerId and current caller has no verified ownership
      if (
        phoneContact.customerId &&
        customerId &&
        phoneContact.customerId !== customerId &&
        !phoneOwnershipVerified
      ) {
        return { action: 'MANUAL_REVIEW', reason: 'RECYCLED_PHONE_SUSPECTED_MANUAL_REVIEW' };
      }

      // Verified phone ownership or direct block -> HTTP 403 Forbidden
      return { action: 'BLOCK_403', reason: 'PHONE_BLACKLISTED' };
    }
  }

  return { action: 'ALLOW' };
}

export interface OtpStateRecord {
  phone: string;
  otpCodeHash: string | null;
  otpExpiresAt: Date | null;
  otpAttempts: number;
  phoneVerifiedAt: Date | null;
  customerId: string | null;
  isBlocked: boolean;
}

export function issuePhoneOtpPure(
  state: OtpStateRecord,
  otpCode: string,
  now = new Date()
): { updated: OtpStateRecord; expiresAt: Date } {
  if (state.otpAttempts >= MAX_OTP_ATTEMPTS && state.otpExpiresAt && state.otpExpiresAt > now) {
    throw new Error('OTP_RATE_LIMIT_EXCEEDED: Too many OTP requests or attempts within window');
  }

  const expiresAt = new Date(now.getTime() + OTP_TTL_MS);
  return {
    updated: {
      ...state,
      otpCodeHash: hashSecretValue(otpCode),
      otpExpiresAt: expiresAt,
      otpAttempts: 0,
    },
    expiresAt,
  };
}

export function verifyPhoneOtpPure(
  state: OtpStateRecord,
  submittedCode: string,
  newCustomerId: string,
  now = new Date()
): { verified: boolean; rebindClearedBlock: boolean; updated: OtpStateRecord; error?: string } {
  if (!state.otpCodeHash || !state.otpExpiresAt) {
    return { verified: false, rebindClearedBlock: false, updated: state, error: 'OTP_NOT_ISSUED' };
  }

  if (now.getTime() > state.otpExpiresAt.getTime()) {
    return { verified: false, rebindClearedBlock: false, updated: state, error: 'OTP_EXPIRED' };
  }

  if (state.otpAttempts >= MAX_OTP_ATTEMPTS) {
    return {
      verified: false,
      rebindClearedBlock: false,
      updated: state,
      error: 'OTP_MAX_ATTEMPTS_EXCEEDED',
    };
  }

  const expectedHash = hashSecretValue(submittedCode);
  if (expectedHash !== state.otpCodeHash) {
    return {
      verified: false,
      rebindClearedBlock: false,
      updated: {
        ...state,
        otpAttempts: state.otpAttempts + 1,
      },
      error: 'OTP_INVALID_CODE',
    };
  }

  const rebindClearedBlock =
    state.isBlocked && state.customerId !== null && state.customerId !== newCustomerId;

  if (rebindClearedBlock) {
    logger.info('[PHONE_REBIND_UNBLOCK]', {
      previousCustomerId: state.customerId,
      newCustomerId,
    });
  }

  return {
    verified: true,
    rebindClearedBlock,
    updated: {
      ...state,
      otpCodeHash: null,
      otpExpiresAt: null,
      otpAttempts: 0,
      phoneVerifiedAt: now,
      customerId: newCustomerId,
      isBlocked: rebindClearedBlock ? false : state.isBlocked,
    },
  };
}

export interface CreateHoldParams {
  itemId?: string;
  itemIds?: string[];
  resourceId?: string;
  startTime: Date;
  customerName?: string | null;
  customerPhone?: string | null;
  customerEmail?: string | null;
  customerTgId?: string | null;
  customerTgUsername?: string | null;
  hasWhatsApp?: boolean;
  hasTelegram?: boolean;
  customerId?: string | null;
  customerNotes?: string | null;
  paymentType?: 'PAY_ON_SITE' | 'PREPAYMENT_ONLINE';
  phoneOwnershipVerified?: boolean;
}

export interface HoldResult {
  order: {
    id: string;
    orderNumber: string;
    status: string;
    totalMinor: number;
    currency: string;
  paymentType: string;
  confirmationStatus: string;
  autoCancelOnNoConfirmation: boolean;
  isNewClient: boolean;
  scheduleVersion: number;
    customerNotes: string | null;
    requiresOperatorAction?: boolean;
    operatorActionReason?: string | null;
  };
  reservation: {
    id: string;
    resourceId: string;
    totalDurationMin: number;
    startTime: string;
    endTime: string;
    status: string;
    holdExpiresAt: string;
  };
}

export async function createSlotHoldLock(params: CreateHoldParams): Promise<HoldResult> {
  const {
    itemId,
    itemIds: rawItemIds,
    resourceId = 'default_master',
    startTime,
    customerName,
    customerPhone,
    customerEmail,
    customerTgId,
    customerId,
    customerNotes,
    customerTgUsername,
    hasWhatsApp = false,
    hasTelegram = false,
    paymentType = 'PAY_ON_SITE',
    phoneOwnershipVerified = false,
  } = params;

  const requestedItemIds =
    rawItemIds && rawItemIds.length > 0 ? rawItemIds : itemId ? [itemId] : [];

  if (requestedItemIds.length === 0) {
    throw new CartValidationError('EMPTY_CART', 'At least one service itemId or itemIds must be provided');
  }

  const sanitizedNotes = sanitizeCustomerNotes(customerNotes);
  const normalizedPhone = normalizePhoneE164(customerPhone);

  const result = await prisma.$transaction(async (tx) => {
    // 1. Resource-scoped advisory lock: SELECT pg_advisory_xact_lock(hashtext('resource_slot_lock_' || $resourceId))
    await acquireResourceSlotLock(tx, resourceId);

    // 2. Check Blacklist & Anti-Begging Perimeter
    const contactConditions: Array<Record<string, unknown>> = [];
    if (customerTgId) {
      contactConditions.push({ platform: 'TELEGRAM', externalId: customerTgId });
    }
    if (normalizedPhone) {
      contactConditions.push({ platform: 'WHATSAPP', externalId: normalizedPhone });
    }
    if (customerId) {
      contactConditions.push({ customerId });
    }

    let requiresOperatorAction = false;
    let operatorActionReason: string | null = null;

    if (contactConditions.length > 0) {
      const matchedContacts = await tx.messengerContact.findMany({
        where: { OR: contactConditions },
      });

      const evalResult = evaluateBlacklistIdentity({
        customerTgId,
        customerId: customerId || customerTgId || null,
        normalizedPhone,
        phoneOwnershipVerified,
        contacts: matchedContacts as unknown as BlacklistContactRecord[],
      });

      if (evalResult.action === 'BLOCK_403') {
        logger.warn('[BOOKING_REJECTED_BLACKLIST]', {
          reason: evalResult.reason,
          resourceId,
        });
        throw new ClientBlacklistedError('Access restricted');
      }

      if (evalResult.action === 'EXPIRED_RISK_CLEARED' && normalizedPhone) {
        await tx.messengerContact.updateMany({
          where: { platform: 'WHATSAPP', externalId: normalizedPhone },
          data: { isBlocked: false, phoneRiskExpiresAt: null, requiresManualReview: false },
        });
      }

      if (evalResult.action === 'MANUAL_REVIEW') {
        requiresOperatorAction = true;
        operatorActionReason = 'PHONE_BLACKLIST_MANUAL_REVIEW';
      }
    }

    // 3. Reload authoritative service items inside transaction (FR-002a, T-103)
    const dbItems = await tx.item.findMany({
      where: { id: { in: requestedItemIds } },
    });

    const validatedCart = validateAndBuildServiceCart(
      requestedItemIds,
      dbItems as unknown as AuthoritativeServiceItem[]
    );

    const endTime = new Date(startTime.getTime() + validatedCart.totalDurationMin * 60 * 1000);
    const now = new Date();
    const holdExpiresAt = new Date(now.getTime() + 15 * 60 * 1000);

    // 4. Release expired holds on this resource
    const expiredReservations = await tx.slotReservation.findMany({
      where: {
        OR: [{ resourceId }, { itemId: { in: validatedCart.itemIds } }],
        status: 'HELD',
        holdExpiresAt: { lte: now },
      },
      select: { id: true, orderId: true },
    });

    if (expiredReservations.length > 0) {
      const expiredIds = expiredReservations.map((r) => r.id);
      const expiredOrderIds = expiredReservations.map((r) => r.orderId);

      await tx.slotReservation.updateMany({
        where: { id: { in: expiredIds } },
        data: { status: 'RELEASED' },
      });

      await tx.order.updateMany({
        where: { id: { in: expiredOrderIds }, status: 'PENDING' },
        data: { status: 'CANCELLED' },
      });
    }

    // 5. Check contiguous overlap against active reservations on resourceId
    const overlappingReservation = await tx.slotReservation.findFirst({
      where: {
        OR: [{ resourceId }, { itemId: { in: validatedCart.itemIds } }],
        startTime: { lt: endTime },
        endTime: { gt: startTime },
        AND: [
          {
            OR: [
              { status: 'BOOKED' },
              { status: 'HELD', holdExpiresAt: { gt: now } },
            ],
          },
        ],
      },
      select: { id: true },
    });

    if (overlappingReservation) {
      throw new SlotConflictError('Selected slot has just been taken by another customer');
    }

    // 6. Client history segmentation (FR-015): New vs Regular client
    const settings = await tx.shopSettings.findUnique({ where: { id: 1 } });
    const autoCancelSetting = settings?.autoCancelForNewClients ?? true;

    let completedVisits = 0;
    const historyFilter: Array<Record<string, unknown>> = [];
    if (customerTgId) historyFilter.push({ customerTgId });
    if (normalizedPhone) historyFilter.push({ customerPhone: normalizedPhone });
    if (customerPhone && customerPhone !== normalizedPhone) {
      historyFilter.push({ customerPhone });
    }
    // Новое поле юзернейма: ищем историю по нему тоже.
    const trimmedTgUsername = (customerTgUsername || '').trim().replace(/^@/, '');
    if (trimmedTgUsername) {
      historyFilter.push({ customerTgUsername: trimmedTgUsername });
      historyFilter.push({ customerTgUsername: `@${trimmedTgUsername}` });
    }

    if (historyFilter.length > 0) {
      completedVisits = await tx.order.count({
        where: {
          status: 'FULFILLED',
          OR: historyFilter,
        },
      });
    }

    const isNewClient = completedVisits === 0;
    const autoCancelOnNoConfirmation = isNewClient && autoCancelSetting;

    // 7. Create PENDING Order with immutable OrderItem snapshots
    const randomSuffix = Math.random().toString(36).substring(2, 8).toUpperCase();
    const orderNumber = `ORD-${Date.now()}-${randomSuffix}`;

    const order = await tx.order.create({
      data: {
        orderNumber,
        status: 'PENDING',
        totalMinor: validatedCart.totalMinor,
        currency: validatedCart.currency,
        customerName: customerName ?? null,
        customerPhone: normalizedPhone ?? customerPhone ?? null,
        customerEmail: customerEmail ?? null,
        customerTgId: customerTgId ?? null,
        customerTgUsername: customerTgUsername ?? null,
        hasWhatsApp,
        hasTelegram,
        customerNotes: sanitizedNotes,
        paymentType,
        confirmationStatus: 'PENDING_STAFF_REVIEW',
        autoCancelOnNoConfirmation,
        scheduleVersion: 1,
        requiresOperatorAction,
        operatorActionReason,
        items: {
          create: validatedCart.snapshots.map((snap) => ({
            itemId: snap.itemId,
            titleSnapshot: snap.titleSnapshot,
            currency: snap.currency,
            durationMin: snap.durationMin,
            quantity: snap.quantity,
            priceMinor: snap.priceMinor,
            stockDecremented: snap.stockDecremented,
          })),
        },
      },
    });

    // 8. Insert HELD reservation on resourceId (dual-writing primary itemId for backward compatibility)
    try {
      const reservation = await tx.slotReservation.create({
        data: {
          resourceId,
          itemId: validatedCart.itemIds[0],
          orderId: order.id,
          startTime,
          endTime,
          totalDurationMin: validatedCart.totalDurationMin,
          status: 'HELD',
          holdExpiresAt,
          requiresOperatorAction,
          operatorActionReason,
        },
      });

      // Build result object before returning
      const result = {
        order: {
          id: order.id,
          orderNumber: order.orderNumber,
          status: order.status,
          totalMinor: order.totalMinor,
          currency: order.currency,
          paymentType: order.paymentType,
        confirmationStatus: order.confirmationStatus,
        autoCancelOnNoConfirmation: order.autoCancelOnNoConfirmation,
        isNewClient,
        scheduleVersion: order.scheduleVersion,
          customerNotes: order.customerNotes,
          requiresOperatorAction: order.requiresOperatorAction,
          operatorActionReason: order.operatorActionReason,
        },
        reservation: {
          id: reservation.id,
          resourceId: reservation.resourceId,
          totalDurationMin: reservation.totalDurationMin,
          startTime: reservation.startTime.toISOString(),
          endTime: reservation.endTime.toISOString(),
          status: reservation.status,
          holdExpiresAt: reservation.holdExpiresAt!.toISOString(),
        },
        _validatedCart: validatedCart,
      };

      return result;
    } catch (err: unknown) {
      const errorStr = String(err);
      if (
        errorStr.includes('23P01') ||
        errorStr.includes('slot_resource_no_overlap') ||
        errorStr.includes('slot_no_overlap') ||
        errorStr.includes('exclusion constraint')
      ) {
        throw new SlotConflictError('Selected slot has just been taken by another customer');
      }
      throw err;
    }
  });

  // Notify Staff Bot pager card if configured (FR-008)
  const staffChatId = process.env.STAFF_CHAT_ID;
  if (staffChatId) {
    try {
      const validatedCart = (result as any)._validatedCart;
      const serviceTitles = validatedCart
        ? validatedCart.snapshots.map((s: any) => s.titleSnapshot)
        : [];

      await dispatchStaffOrderPagerCard(
        {
          orderId: result.order.id,
          orderNumber: result.order.orderNumber,
          serviceTitles,
          totalDurationMin: result.reservation.totalDurationMin,
          startTimeIso: result.reservation.startTime,
          endTimeIso: result.reservation.endTime,
          totalMinor: result.order.totalMinor,
          currency: result.order.currency,
          paymentType: result.order.paymentType,
          customerName: customerName || '',
          customerPhone: customerPhone || '',
          customerTgUsername: customerTgUsername ?? null,
          hasWhatsApp,
          hasTelegram,
          hasCustomerNotes: Boolean(sanitizedNotes),
          customerNotes: sanitizedNotes,
          isNewClient: result.order.isNewClient,
        },
        staffChatId
      );
    } catch (err: unknown) {
      logger.error('[STAFF_CARD_DISPATCH_ERROR]', { orderId: result.order.id, error: String(err) });
    }
  }

  // Remove temporary _validatedCart field before returning to caller
  delete (result as any)._validatedCart;
  return result;
}

// -------------------------------------------------------------
// Customer Contact Validation & Retention Behavior (T009, FR-304)
// Reuses existing Order booking customer fields without cross-channel Party
// -------------------------------------------------------------

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const E164_STRICT_REGEX = /^\+[1-9]\d{1,14}$/;

export interface CustomerContactValidationResult {
  valid: boolean;
  type?: 'PHONE' | 'EMAIL';
  normalized?: string;
  error?: string;
}

/**
 * Validates and normalizes customer contact details (E.164 phone or email).
 * Strictly strips/rejects HTML tags (INV-010).
 */
export function validateCustomerContact(contact: string | null | undefined): CustomerContactValidationResult {
  if (!contact || typeof contact !== 'string') {
    return { valid: false, error: 'Customer contact cannot be empty' };
  }

  const trimmed = contact.trim();
  if (/<[^>]+>/.test(trimmed)) {
    return { valid: false, error: 'HTML tags are strictly prohibited in contact info' };
  }

  // Check email
  if (EMAIL_REGEX.test(trimmed)) {
    if (trimmed.length > 160) {
      return { valid: false, error: 'Email address exceeds maximum length of 160 characters' };
    }
    return { valid: true, type: 'EMAIL', normalized: trimmed.toLowerCase() };
  }

  // Check and normalize phone
  const normalizedPhone = normalizePhoneE164(trimmed);
  if (normalizedPhone && E164_STRICT_REGEX.test(normalizedPhone)) {
    return { valid: true, type: 'PHONE', normalized: normalizedPhone };
  }

  return {
    valid: false,
    error: 'Contact must be a valid E.164 phone number (e.g. +37499123456) or email address',
  };
}

/**
 * Calculates customer contact data retention expiry date.
 * Default retention is 365 days past the appointment date unless configured otherwise.
 */
export function calculateCustomerRetentionExpiry(appointmentDate: Date, retentionDays = 365): Date {
  const expiry = new Date(appointmentDate.getTime());
  expiry.setDate(expiry.getDate() + retentionDays);
  return expiry;
}
