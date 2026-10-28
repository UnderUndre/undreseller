/**
 * T082 acceptance tests — Custom Booking Fields (US6 scenarios, FR-423/424/434).
 * Service-layer acceptance with mocked prisma (same pattern as T080 unit tests).
 */

jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    customBookingField: {
      count: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    bookingFieldAnswer: {
      upsert: jest.fn(),
      findMany: jest.fn(),
    },
  },
}));

jest.mock('@/lib/telemetry/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('@/lib/security/staffAuth', () => ({
  emitAuditEvent: jest.fn().mockResolvedValue(undefined),
}));

import { prisma } from '@/lib/db/prisma';
import {
  validateAnswersForService,
  persistBookingAnswers,
  getAnswersForBookings,
  CustomFieldValidationError,
} from '@/lib/kernel/customFieldService';

/** US6-SC1: required field bound to the booked service. */
const boundRequiredField = {
  id: 'f-floor',
  key: 'floor-number-abc123',
  label: 'Floor number',
  type: 'NUMBER',
  required: true,
  optionsJson: { min: 1, max: 40 },
  boundItemIds: ['svc-massage'],
  sortOrder: 0,
  archivedAt: null,
  createdAt: new Date('2026-10-01'),
};

const textField = {
  id: 'f-notes',
  key: 'entry-notes-def456',
  label: 'Entry notes',
  type: 'TEXT',
  required: false,
  optionsJson: null,
  boundItemIds: [],
  sortOrder: 1,
  archivedAt: null,
  createdAt: new Date('2026-10-01'),
};

describe('Custom Fields acceptance (T082, US6)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('US6-SC1: booking missing a required bound field is rejected at the service layer', async () => {
    (prisma.customBookingField.findMany as jest.Mock).mockResolvedValue([boundRequiredField]);

    // No answers at all
    await expect(validateAnswersForService('svc-massage', undefined)).rejects.toBeInstanceOf(
      CustomFieldValidationError
    );
    await expect(validateAnswersForService('svc-massage', undefined)).rejects.toMatchObject({
      code: 'REQUIRED_FIELD_MISSING',
    });

    // Empty answer — same rejection
    await expect(validateAnswersForService('svc-massage', { 'floor-number-abc123': '' })).rejects.toMatchObject(
      { code: 'REQUIRED_FIELD_MISSING' }
    );

    // With the required answer present, validation passes
    const ok = await validateAnswersForService('svc-massage', { 'floor-number-abc123': 3 });
    expect(ok).toHaveLength(1);
    expect(ok[0]).toMatchObject({ fieldId: 'f-floor', valueNumber: 3 });
  });

  it('US6 edge: injection payload in TEXT answer is stored sanitized', async () => {
    (prisma.customBookingField.findMany as jest.Mock).mockResolvedValue([boundRequiredField, textField]);
    (prisma.bookingFieldAnswer.upsert as jest.Mock).mockResolvedValue({});

    const normalized = await validateAnswersForService('svc-massage', {
      'floor-number-abc123': 2,
      'entry-notes-def456': '<script>alert(1)</script>Please use the side entrance<img src=x onerror=alert(1)>',
    });

    const textAnswer = normalized.find((a) => a.fieldId === 'f-notes');
    expect(textAnswer?.valueText).not.toContain('<');
    expect(textAnswer?.valueText).not.toContain('script');
    expect(textAnswer?.valueText).toContain('Please use the side entrance');

    await persistBookingAnswers('res-1', normalized);

    const createCall = (prisma.bookingFieldAnswer.upsert as jest.Mock).mock.calls.find(
      (c) => c[0].create.fieldId === 'f-notes'
    );
    expect(createCall[0].create.valueText).not.toContain('<script>');
  });

  it('US6 clarify: archived field keeps historical answers readable (no cascade delete)', async () => {
    // Answer rows survive the field's archiving — getAnswersForBookings reads
    // BookingFieldAnswer snapshots by reservation, never joins on field active state.
    (prisma.bookingFieldAnswer.findMany as jest.Mock).mockResolvedValue([
      {
        slotReservationId: 'res-old',
        labelSnapshot: 'Floor number',
        typeSnapshot: 'NUMBER',
        valueText: null,
        valueNumber: 9,
        valueBool: null,
      },
    ]);

    const out = await getAnswersForBookings(['res-old']);

    expect(out['res-old']).toEqual([
      { label: 'Floor number', type: 'NUMBER', value: '9' },
    ]);
    // The read path queries answers only — an archived definition changes nothing.
    const where = (prisma.bookingFieldAnswer.findMany as jest.Mock).mock.calls[0][0].where;
    expect(where).toEqual({ slotReservationId: { in: ['res-old'] } });
  });

  it('US6 clarify: archived field is excluded from new-booking validation', async () => {
    // After archiving, getActiveFieldsForService no longer returns the field,
    // so a booking without the answer succeeds (archived = not required anymore).
    (prisma.customBookingField.findMany as jest.Mock).mockResolvedValue([]);

    const normalized = await validateAnswersForService('svc-massage', {});
    expect(normalized).toEqual([]);
  });
});
