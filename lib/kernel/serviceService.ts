/**
 * Service Kernel Application Service (T010)
 * Requirements: FR-301, FR-338, FR-339, INV-008
 * Standards: NIST SP 800-218 SSDF & ISO/IEC/IEEE 12207:2017
 */

import { prisma } from '../db/prisma';
import { logger } from '../telemetry/logger';
import { StaffActorContext, assertStaffRole } from '../security/staffRbac';
import { emitAuditEvent } from '../security/staffAuth';
import { resolveServicePrice, ServicePriceBreakdown } from '../../config/currency-registry';
import { HTML_TAG_REGEX } from '../../config/shop.config';

export interface ServiceSummary {
  id: string;
  slug: string;
  title: string;
  description: string;
  durationMin: number;
  inCallEnabled: boolean;
  outCallEnabled: boolean;
  priceMinor: number;
  outCallPriceMinor: number | null;
  outCallTravelFeeMinor: number;
  bufferBeforeMin: number;
  bufferAfterMin: number;
  outCallTravelBeforeMin: number;
  outCallTravelAfterMin: number;
  cancellationCutoffHours: number;
  isActive: boolean;
  /** 004 US9 additions */
  currency: string;
  sortOrder: number;
  requiresFullPrepayment: boolean;
  inCallPricing?: ServicePriceBreakdown;
  outCallPricing?: ServicePriceBreakdown;
}

export interface CreateServiceInput {
  title: string;
  slug?: string;
  description: string;
  durationMin: number;
  priceMinor: number;
  currency?: string;
  inCallEnabled?: boolean;
  outCallEnabled?: boolean;
  outCallPriceMinor?: number | null;
  outCallTravelFeeMinor?: number;
  bufferBeforeMin?: number;
  bufferAfterMin?: number;
  outCallTravelBeforeMin?: number;
  outCallTravelAfterMin?: number;
  cancellationCutoffHours?: number;
  isActive?: boolean;
  requiresFullPrepayment?: boolean;
}

export interface UpdateServiceInput {
  title?: string;
  description?: string;
  durationMin?: number;
  priceMinor?: number;
  inCallEnabled?: boolean;
  outCallEnabled?: boolean;
  outCallPriceMinor?: number | null;
  outCallTravelFeeMinor?: number;
  bufferBeforeMin?: number;
  bufferAfterMin?: number;
  outCallTravelBeforeMin?: number;
  outCallTravelAfterMin?: number;
  cancellationCutoffHours?: number;
  isActive?: boolean;
  requiresFullPrepayment?: boolean;
  sortOrder?: number;
}

export async function listServices(options?: { activeOnly?: boolean }): Promise<ServiceSummary[]> {
  const settings = await prisma.shopSettings.findUnique({ where: { id: 1 } });
  const currency = settings?.currency || 'USD';

  const items = await prisma.item.findMany({
    where: {
      itemType: 'SERVICE',
      ...(options?.activeOnly ? { isActive: true } : {}),
    },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
  });

  return items.map((item) => {
    const inCallPricing = item.inCallEnabled
      ? resolveServicePrice(item, 'IN_CALL', currency)
      : undefined;
    const outCallPricing = item.outCallEnabled
      ? resolveServicePrice(item, 'OUT_CALL', currency)
      : undefined;

    return {
      id: item.id,
      slug: item.slug,
      title: item.title,
      description: item.description,
      durationMin: item.durationMin || 60,
      inCallEnabled: item.inCallEnabled,
      outCallEnabled: item.outCallEnabled,
      priceMinor: item.priceMinor,
      outCallPriceMinor: item.outCallPriceMinor,
      outCallTravelFeeMinor: item.outCallTravelFeeMinor,
      bufferBeforeMin: item.bufferBeforeMin,
      bufferAfterMin: item.bufferAfterMin,
      outCallTravelBeforeMin: item.outCallTravelBeforeMin,
      outCallTravelAfterMin: item.outCallTravelAfterMin,
      cancellationCutoffHours: item.cancellationCutoffHours,
      isActive: item.isActive,
      currency: item.currency,
      sortOrder: item.sortOrder,
      requiresFullPrepayment: item.requiresFullPrepayment,
      inCallPricing,
      outCallPricing,
    };
  });
}

export async function getServiceById(id: string): Promise<ServiceSummary | null> {
  const settings = await prisma.shopSettings.findUnique({ where: { id: 1 } });
  const currency = settings?.currency || 'USD';

  const item = await prisma.item.findFirst({
    where: { id, itemType: 'SERVICE' },
  });

  if (!item) return null;

  return {
    id: item.id,
    slug: item.slug,
    title: item.title,
    description: item.description,
    durationMin: item.durationMin || 60,
    inCallEnabled: item.inCallEnabled,
    outCallEnabled: item.outCallEnabled,
    priceMinor: item.priceMinor,
    outCallPriceMinor: item.outCallPriceMinor,
    outCallTravelFeeMinor: item.outCallTravelFeeMinor,
    bufferBeforeMin: item.bufferBeforeMin,
    bufferAfterMin: item.bufferAfterMin,
    outCallTravelBeforeMin: item.outCallTravelBeforeMin,
    outCallTravelAfterMin: item.outCallTravelAfterMin,
    cancellationCutoffHours: item.cancellationCutoffHours,
    isActive: item.isActive,
    currency: item.currency,
    sortOrder: item.sortOrder,
    requiresFullPrepayment: item.requiresFullPrepayment,
    inCallPricing: item.inCallEnabled ? resolveServicePrice(item, 'IN_CALL', currency) : undefined,
    outCallPricing: item.outCallEnabled ? resolveServicePrice(item, 'OUT_CALL', currency) : undefined,
  };
}

export async function createService(
  input: CreateServiceInput,
  actor: StaffActorContext
): Promise<ServiceSummary> {
  assertStaffRole(actor, 'OPERATOR');

  if (HTML_TAG_REGEX.test(input.title) || HTML_TAG_REGEX.test(input.description)) {
    throw new Error('HTML tags are strictly prohibited in service title and description');
  }

  const inCall = input.inCallEnabled ?? true;
  const outCall = input.outCallEnabled ?? false;
  if (!inCall && !outCall) {
    throw new Error('At least one fulfillment mode (IN_CALL or OUT_CALL) must be enabled');
  }

  const settings = await prisma.shopSettings.findUnique({ where: { id: 1 } });
  const currency = input.currency || settings?.currency || 'USD';

  // If inCall enabled, verify business service address is set or warn
  if (inCall && (!settings?.businessServiceAddress || settings.businessServiceAddress.trim() === '')) {
    logger.warn('[SERVICE_CREATED_WITHOUT_ADDRESS] Business service address unset for IN_CALL service');
  }

  const slug =
    input.slug ||
    input.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '') + `-${Date.now().toString(36)}`;

  const created = await prisma.item.create({
    data: {
      slug,
      title: input.title.trim(),
      description: input.description.trim(),
      itemType: 'SERVICE',
      priceMinor: Math.max(0, input.priceMinor),
      currency,
      durationMin: Math.max(15, input.durationMin || 60),
      inCallEnabled: inCall,
      outCallEnabled: outCall,
      outCallPriceMinor: input.outCallPriceMinor != null ? Math.max(0, input.outCallPriceMinor) : null,
      outCallTravelFeeMinor: Math.max(0, input.outCallTravelFeeMinor || 0),
      bufferBeforeMin: Math.max(0, input.bufferBeforeMin || 0),
      bufferAfterMin: Math.max(0, input.bufferAfterMin || 0),
      outCallTravelBeforeMin: Math.max(0, input.outCallTravelBeforeMin || 0),
      outCallTravelAfterMin: Math.max(0, input.outCallTravelAfterMin || 0),
      cancellationCutoffHours: Math.max(1, input.cancellationCutoffHours || 3),
      isActive: input.isActive ?? true,
      requiresFullPrepayment: input.requiresFullPrepayment ?? false,
    },
  });

  await emitAuditEvent({
    action: 'SERVICE_CREATED',
    actorId: actor.actorId,
    actorRole: actor.actorRole,
    aggregateType: 'SERVICE',
    aggregateId: created.id,
    reason: `Staff created service ${created.title}`,
    metadataJson: { slug: created.slug, inCall, outCall },
  });

  return getServiceById(created.id) as Promise<ServiceSummary>;
}

export async function updateService(
  id: string,
  input: UpdateServiceInput,
  actor: StaffActorContext
): Promise<ServiceSummary> {
  assertStaffRole(actor, 'OPERATOR');

  const existing = await prisma.item.findUnique({ where: { id } });
  if (!existing || existing.itemType !== 'SERVICE') {
    throw new Error(`Service not found: ${id}`);
  }

  if (input.title && HTML_TAG_REGEX.test(input.title)) {
    throw new Error('HTML tags are strictly prohibited in service title');
  }
  if (input.description && HTML_TAG_REGEX.test(input.description)) {
    throw new Error('HTML tags are strictly prohibited in service description');
  }

  const inCall = input.inCallEnabled !== undefined ? input.inCallEnabled : existing.inCallEnabled;
  const outCall = input.outCallEnabled !== undefined ? input.outCallEnabled : existing.outCallEnabled;
  const isActive = input.isActive !== undefined ? input.isActive : existing.isActive;

  if (isActive && !inCall && !outCall) {
    throw new Error('At least one fulfillment mode (IN_CALL or OUT_CALL) must be enabled on active service');
  }

  const updated = await prisma.item.update({
    where: { id },
    data: {
      ...(input.title !== undefined ? { title: input.title.trim() } : {}),
      ...(input.description !== undefined ? { description: input.description.trim() } : {}),
      ...(input.durationMin !== undefined ? { durationMin: Math.max(15, input.durationMin) } : {}),
      ...(input.priceMinor !== undefined ? { priceMinor: Math.max(0, input.priceMinor) } : {}),
      ...(input.inCallEnabled !== undefined ? { inCallEnabled: input.inCallEnabled } : {}),
      ...(input.outCallEnabled !== undefined ? { outCallEnabled: input.outCallEnabled } : {}),
      ...(input.outCallPriceMinor !== undefined
        ? { outCallPriceMinor: input.outCallPriceMinor != null ? Math.max(0, input.outCallPriceMinor) : null }
        : {}),
      ...(input.outCallTravelFeeMinor !== undefined
        ? { outCallTravelFeeMinor: Math.max(0, input.outCallTravelFeeMinor) }
        : {}),
      ...(input.bufferBeforeMin !== undefined ? { bufferBeforeMin: Math.max(0, input.bufferBeforeMin) } : {}),
      ...(input.bufferAfterMin !== undefined ? { bufferAfterMin: Math.max(0, input.bufferAfterMin) } : {}),
      ...(input.outCallTravelBeforeMin !== undefined
        ? { outCallTravelBeforeMin: Math.max(0, input.outCallTravelBeforeMin) }
        : {}),
      ...(input.outCallTravelAfterMin !== undefined
        ? { outCallTravelAfterMin: Math.max(0, input.outCallTravelAfterMin) }
        : {}),
      ...(input.cancellationCutoffHours !== undefined
        ? { cancellationCutoffHours: Math.max(1, input.cancellationCutoffHours) }
        : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.requiresFullPrepayment !== undefined
        ? { requiresFullPrepayment: input.requiresFullPrepayment }
        : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: Math.max(0, input.sortOrder) } : {}),
    },
  });

  await emitAuditEvent({
    action: 'SERVICE_UPDATED',
    actorId: actor.actorId,
    actorRole: actor.actorRole,
    aggregateType: 'SERVICE',
    aggregateId: updated.id,
    reason: `Staff updated service parameters for ${updated.title}`,
    metadataJson: {
      inCall: updated.inCallEnabled,
      outCall: updated.outCallEnabled,
      priceMinor: updated.priceMinor,
    },
  });

  return getServiceById(updated.id) as Promise<ServiceSummary>;
}
