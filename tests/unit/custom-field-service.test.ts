/**
 * T080 unit tests — Custom Field Service (US6, FR-423/434).
 * Mocked prisma, mirrors tests/unit/waitlist-service.test.ts patterns.
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
  createField,
  updateField,
  getActiveFieldsForService,
  validateAnswersForService,
  persistBookingAnswers,
  getAnswersForBookings,
  CustomFieldValidationError,
  MAX_TEXT_ANSWER_LENGTH,
} from '@/lib/kernel/customFieldService';
import { MAX_ACTIVE_CUSTOM_FIELDS } from '@/lib/validation/adminSchemas';

const actor = { actorId: 'staff-1', actorRole: 'OPERATOR' } as never;

const baseField = {
  id: 'f1',
  key: 'floor-number-x1',
  label: 'Floor number',
  type: 'NUMBER',
  required: true,
  optionsJson: { min: 1, max: 25 },
  boundItemIds: [],
  sortOrder: 0,
  archivedAt: null,
  createdAt: new Date('2026-10-01'),
};

describe('Custom Field Service (T080, FR-423/434)', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('create — archive-only lifecycle & cap', () => {
    it('creates a field with generated key and audit event', async () => {
      (prisma.customBookingField.count as jest.Mock).mockResolvedValue(0);
      (prisma.customBookingField.create as jest.Mock).mockResolvedValue({ ...baseField, id: 'new' });

      const created = await createField(
        { label: 'Beard trim?', type: 'CHECKBOX', required: false },
        actor
      );

      expect(created.id).toBe('new');
      const data = (prisma.customBookingField.create as jest.Mock).mock.calls[0][0].data;
      expect(data.key).toMatch(/^beard-trim-/);
      expect(data.type).toBe('CHECKBOX');
      expect(data.boundItemIds).toEqual([]);
    });

    it(`rejects creation beyond ${MAX_ACTIVE_CUSTOM_FIELDS} active fields`, async () => {
      (prisma.customBookingField.count as jest.Mock).mockResolvedValue(MAX_ACTIVE_CUSTOM_FIELDS);
      await expect(createField({ label: 'Extra', type: 'TEXT' }, actor)).rejects.toMatchObject({
        statusCode: 422,
      });
      expect(prisma.customBookingField.create).not.toHaveBeenCalled();
    });

    it('SINGLE_SELECT requires at least one option', async () => {
      (prisma.customBookingField.count as jest.Mock).mockResolvedValue(0);
      await expect(
        createField({ label: 'Pick one', type: 'SINGLE_SELECT', options: [] }, actor)
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  describe('update — archive-only', () => {
    it('archive sets archivedAt; no delete path exists', async () => {
      (prisma.customBookingField.findUnique as jest.Mock).mockResolvedValue(baseField);
      (prisma.customBookingField.update as jest.Mock).mockResolvedValue({
        ...baseField,
        archivedAt: new Date(),
      });

      await updateField('f1', { archived: true }, actor);

      const data = (prisma.customBookingField.update as jest.Mock).mock.calls[0][0].data;
      expect(data.archivedAt).toBeInstanceOf(Date);
    });

    it('un-archive clears archivedAt', async () => {
      (prisma.customBookingField.findUnique as jest.Mock).mockResolvedValue({
        ...baseField,
        archivedAt: new Date(),
      });
      (prisma.customBookingField.update as jest.Mock).mockResolvedValue(baseField);

      await updateField('f1', { archived: false }, actor);

      const data = (prisma.customBookingField.update as jest.Mock).mock.calls[0][0].data;
      expect(data.archivedAt).toBeNull();
    });

    it('404 for unknown field', async () => {
      (prisma.customBookingField.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(updateField('nope', { label: 'x' }, actor)).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('booking-form inclusion', () => {
    it('returns unbound (instance-wide) + bound-to-service active fields only', async () => {
      (prisma.customBookingField.findMany as jest.Mock).mockResolvedValue([baseField]);

      const fields = await getActiveFieldsForService('svc-1');

      expect(fields).toEqual([baseField]);
      const where = (prisma.customBookingField.findMany as jest.Mock).mock.calls[0][0].where;
      expect(where.archivedAt).toBeNull();
      // empty binding (instance-wide) OR explicit binding to the item
      expect(where.OR).toEqual([
        { boundItemIds: { isEmpty: true } },
        { boundItemIds: { has: 'svc-1' } },
      ]);
    });
  });

  describe('answer validation (all 4 types, FR-434)', () => {
    const fields = [
      { ...baseField, id: 'f-text', type: 'TEXT', required: false, optionsJson: null },
      {
        ...baseField,
        id: 'f-num',
        type: 'NUMBER',
        required: true,
        optionsJson: { min: 1, max: 25 },
      },
      {
        ...baseField,
        id: 'f-select',
        type: 'SINGLE_SELECT',
        required: false,
        optionsJson: { options: ['Morning', 'Evening'] },
      },
      { ...baseField, id: 'f-check', type: 'CHECKBOX', required: false, optionsJson: null },
    ];

    function mockFields(list: typeof fields) {
      (prisma.customBookingField.findMany as jest.Mock).mockResolvedValue(list);
    }

    it('validates and normalizes all four types', async () => {
      mockFields(fields);
      const normalized = await validateAnswersForService('svc-1', {
        'f-text': '  Please ring the doorbell  ',
        'f-num': 5,
        'f-select': 'Morning',
        'f-check': true,
      });

      expect(normalized).toEqual([
        expect.objectContaining({ fieldId: 'f-text', valueText: 'Please ring the doorbell' }),
        expect.objectContaining({ fieldId: 'f-num', valueNumber: 5 }),
        expect.objectContaining({ fieldId: 'f-select', valueText: 'Morning' }),
        expect.objectContaining({ fieldId: 'f-check', valueBool: true }),
      ]);
    });

    it('rejects missing required answer', async () => {
      mockFields([fields[1]]);
      await expect(validateAnswersForService('svc-1', {})).rejects.toBeInstanceOf(
        CustomFieldValidationError
      );
      await expect(validateAnswersForService('svc-1', {})).rejects.toMatchObject({
        code: 'REQUIRED_FIELD_MISSING',
      });
    });

    it('rejects NUMBER out of bounds', async () => {
      mockFields([fields[1]]);
      await expect(validateAnswersForService('svc-1', { 'f-num': 100 })).rejects.toMatchObject({
        code: 'ANSWER_OUT_OF_RANGE',
      });
    });

    it('rejects SINGLE_SELECT value not in options', async () => {
      mockFields([fields[2]]);
      await expect(
        validateAnswersForService('svc-1', { 'f-select': 'Noon' })
      ).rejects.toMatchObject({ code: 'INVALID_ANSWER' });
    });

    it('rejects non-boolean CHECKBOX answer', async () => {
      mockFields([fields[3]]);
      await expect(
        validateAnswersForService('svc-1', { 'f-check': 'yes' })
      ).rejects.toMatchObject({ code: 'INVALID_ANSWER' });
    });

    it(`rejects TEXT answer over ${MAX_TEXT_ANSWER_LENGTH} chars`, async () => {
      mockFields([fields[0]]);
      await expect(
        validateAnswersForService('svc-1', { 'f-text': 'a'.repeat(MAX_TEXT_ANSWER_LENGTH + 1) })
      ).rejects.toMatchObject({ code: 'TEXT_ANSWER_TOO_LONG' });
    });

    it('optional fields left empty are skipped and booking proceeds', async () => {
      mockFields(fields);
      const normalized = await validateAnswersForService('svc-1', { 'f-num': 3 });
      expect(normalized).toHaveLength(1);
    });
  });

  describe('snapshot persistence (FR-434)', () => {
    it('persists labelSnapshot/typeSnapshot with the answer', async () => {
      (prisma.bookingFieldAnswer.upsert as jest.Mock).mockResolvedValue({});

      const count = await persistBookingAnswers('res-1', [
        {
          fieldId: 'f1',
          labelSnapshot: 'Floor number',
          typeSnapshot: 'NUMBER',
          valueText: null,
          valueNumber: 7,
          valueBool: null,
        },
      ]);

      expect(count).toBe(1);
      const call = (prisma.bookingFieldAnswer.upsert as jest.Mock).mock.calls[0][0];
      expect(call.where).toEqual({
        slotReservationId_fieldId: { slotReservationId: 'res-1', fieldId: 'f1' },
      });
      expect(call.create).toEqual(
        expect.objectContaining({ labelSnapshot: 'Floor number', typeSnapshot: 'NUMBER', valueNumber: 7 })
      );
    });

    it('snapshot is immutable on re-persist: update touches only value columns', async () => {
      (prisma.bookingFieldAnswer.upsert as jest.Mock).mockResolvedValue({});

      await persistBookingAnswers('res-1', [
        {
          fieldId: 'f1',
          labelSnapshot: 'Renamed label',
          typeSnapshot: 'TEXT',
          valueText: 'updated',
          valueNumber: null,
          valueBool: null,
        },
      ]);

      const call = (prisma.bookingFieldAnswer.upsert as jest.Mock).mock.calls[0][0];
      expect(call.update).toEqual({ valueText: 'updated', valueNumber: null, valueBool: null });
      expect(call.update.labelSnapshot).toBeUndefined();
      expect(call.update.typeSnapshot).toBeUndefined();
    });
  });

  describe('staff answer view sanitization', () => {
    it('strips HTML from stored answers before display', async () => {
      (prisma.bookingFieldAnswer.findMany as jest.Mock).mockResolvedValue([
        {
          slotReservationId: 'res-1',
          labelSnapshot: 'Notes <b>field</b>',
          typeSnapshot: 'TEXT',
          valueText: '<script>alert(1)</script> hello',
          valueNumber: null,
          valueBool: null,
        },
      ]);

      const out = await getAnswersForBookings(['res-1']);
      expect(out['res-1'][0].label).toBe('Notes field');
      // Tag-strip sanitization (same policy as sanitizeCustomerNotes):
      // markup is removed, the payload text itself never renders as HTML.
      expect(out['res-1'][0].value).toBe('alert(1) hello');
      expect(out['res-1'][0].value).not.toContain('<script>');
    });

    it('renders CHECKBOX as Yes/No and NUMBER as string', async () => {
      (prisma.bookingFieldAnswer.findMany as jest.Mock).mockResolvedValue([
        {
          slotReservationId: 'res-1',
          labelSnapshot: 'Beard trim',
          typeSnapshot: 'CHECKBOX',
          valueText: null,
          valueNumber: null,
          valueBool: true,
        },
        {
          slotReservationId: 'res-1',
          labelSnapshot: 'Floor',
          typeSnapshot: 'NUMBER',
          valueText: null,
          valueNumber: 12,
          valueBool: null,
        },
      ]);

      const out = await getAnswersForBookings(['res-1']);
      expect(out['res-1'][0].value).toBe('Yes');
      expect(out['res-1'][1].value).toBe('12');
    });
  });
});
