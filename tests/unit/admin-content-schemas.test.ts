/**
 * T061–T064 unit tests: shared admin validation schemas (validation parity),
 * settings foundation partitioning (OWNER enforcement inputs) and client
 * presign-limit sync with the authoritative server constants (FR-436/438/442).
 */

import {
  adminServiceCreateSchema,
  adminServiceUpdateSchema,
  adminPortfolioItemCreateSchema,
  foundationSettingsSchema,
  operationalSettingsSchema,
  partitionSettingsBody,
  DURATION_QUANTUM_MIN,
} from '@/lib/validation/adminSchemas';
import { CLIENT_PRESIGN_LIMITS } from '@/lib/uploads/presignLimits';
import { PRESIGN_LIMITS } from '@/lib/uploads/presign';

describe('adminServiceCreateSchema (FR-439/440)', () => {
  it('accepts a minimal valid quick-create payload', () => {
    const parsed = adminServiceCreateSchema.safeParse({
      title: 'Deep tissue massage',
      priceMinor: 5000,
      durationMin: 60,
    });
    expect(parsed.success).toBe(true);
  });

  it('enforces 15-minute duration quantum', () => {
    expect(DURATION_QUANTUM_MIN).toBe(15);
    expect(adminServiceCreateSchema.safeParse({ title: 'Ok service', priceMinor: 1, durationMin: 20 }).success).toBe(
      false
    );
    expect(adminServiceCreateSchema.safeParse({ title: 'Ok service', priceMinor: 1, durationMin: 45 }).success).toBe(
      true
    );
  });

  it('rejects titles that are too short', () => {
    expect(adminServiceCreateSchema.safeParse({ title: 'A', priceMinor: 1, durationMin: 60 }).success).toBe(false);
  });
});

describe('adminServiceUpdateSchema (one-tap toggle + reorder)', () => {
  it('accepts isActive toggle', () => {
    expect(adminServiceUpdateSchema.safeParse({ isActive: false }).success).toBe(true);
  });

  it('accepts sortOrder for arrow reorder swap', () => {
    expect(adminServiceUpdateSchema.safeParse({ sortOrder: 3 }).success).toBe(true);
    expect(adminServiceUpdateSchema.safeParse({ sortOrder: -1 }).success).toBe(false);
  });
});

describe('adminPortfolioItemCreateSchema', () => {
  it('requires title and mediaUrl', () => {
    expect(adminPortfolioItemCreateSchema.safeParse({ title: 'Work', mediaUrl: 'https://cdn.example/x.webp' }).success).toBe(
      true
    );
    expect(adminPortfolioItemCreateSchema.safeParse({ title: 'Work' }).success).toBe(false);
  });
});

describe('settings foundation/operational partitioning (T064, FR-438, FR-442)', () => {
  it('routes foundation fields separately from operational ones', () => {
    const result = partitionSettingsBody({
      currency: 'usd',
      timeZone: 'Asia/Yerevan',
      confirmationNoticeHours: 12,
      requireStaffApprovalForInCall: true,
    });
    expect(result.foundation).toEqual({ currency: 'usd', timeZone: 'Asia/Yerevan' });
    expect(result.operational).toEqual({
      confirmationNoticeHours: 12,
      requireStaffApprovalForInCall: true,
    });
    expect(result.unknownKeys).toEqual([]);
  });

  it('flags unknown keys for a 400', () => {
    const result = partitionSettingsBody({ hackerField: true });
    expect(result.unknownKeys).toEqual(['hackerField']);
  });

  it('foundation schema validates IANA timezone', () => {
    expect(foundationSettingsSchema.safeParse({ timeZone: 'Asia/Yerevan' }).success).toBe(true);
    expect(foundationSettingsSchema.safeParse({ timeZone: 'Not/AZone' }).success).toBe(false);
  });

  it('slotGridStepMin is strictly 15 or 30 (FR-442)', () => {
    expect(operationalSettingsSchema.safeParse({ slotGridStepMin: 15 }).success).toBe(true);
    expect(operationalSettingsSchema.safeParse({ slotGridStepMin: 30 }).success).toBe(true);
    expect(operationalSettingsSchema.safeParse({ slotGridStepMin: 20 }).success).toBe(false);
    expect(operationalSettingsSchema.safeParse({ slotGridStepMin: 45 }).success).toBe(false);
  });
});

describe('client presign limits stay in sync with server (T062, FR-441)', () => {
  it('CLIENT_PRESIGN_LIMITS mirrors PRESIGN_LIMITS', () => {
    expect(CLIENT_PRESIGN_LIMITS.maxContentLength).toBe(PRESIGN_LIMITS.maxContentLength);
    expect(CLIENT_PRESIGN_LIMITS.allowedContentTypes).toEqual(PRESIGN_LIMITS.allowedContentTypes);
    expect(CLIENT_PRESIGN_LIMITS.allowedFolders).toEqual(PRESIGN_LIMITS.allowedFolders);
    expect(CLIENT_PRESIGN_LIMITS.maxTtlSeconds).toBe(PRESIGN_LIMITS.maxTtlSeconds);
  });
});
