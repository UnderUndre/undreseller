/**
 * Custom Booking Field Application Service (T080, US6, FR-423/424/434)
 *
 * Archive-only lifecycle: deactivation sets archivedAt, hard delete is
 * prohibited; historical answers keep an immutable definition snapshot
 * (labelSnapshot/typeSnapshot) and are purged only with the booking's
 * retention purge. Bounded: ≤10 active fields per instance; text answers
 * ≤1000 chars, numerics range-validated, answers sanitized (no HTML).
 */

import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma';
import { StaffActorContext } from '../security/staffRbac';
import { emitAuditEvent } from '../security/staffAuth';

import {
  AdminFieldUpdateInput,
  CustomFieldAnswerValue,
  MAX_ACTIVE_CUSTOM_FIELDS,
} from '../validation/adminSchemas';

/** Admin-facing create input (matches adminFieldCreateSchema output; `required` optional for direct callers). */
export interface FieldCreateInput {
  label: string;
  type: CustomFieldType;
  required?: boolean;
  options?: string[];
  min?: number;
  max?: number;
  boundItemIds?: string[];
  sortOrder?: number;
}

export type FieldUpdateInput = AdminFieldUpdateInput;

/** Error carrying an HTTP status code consumed by API route handlers. */
type StatusCodeError = Error & { statusCode: number };

export class CustomFieldValidationError extends Error {
  statusCode = 422;
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'CustomFieldValidationError';
  }
}

export type CustomFieldType = 'TEXT' | 'NUMBER' | 'SINGLE_SELECT' | 'CHECKBOX';

export interface CustomFieldRecord {
  id: string;
  key: string;
  label: string;
  type: CustomFieldType;
  required: boolean;
  optionsJson: Prisma.JsonValue | null;
  boundItemIds: string[];
  sortOrder: number;
  archivedAt: Date | null;
  createdAt: Date;
}

/** ≤1000 chars per text answer (FR-434). */
export const MAX_TEXT_ANSWER_LENGTH = 1000;

const HTML_TAG_GLOBAL_REGEX = /<[^>]*>/g;

function httpError(statusCode: number, message: string): StatusCodeError {
  return Object.assign(new Error(message), { statusCode });
}

function slugify(label: string): string {
  return (
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'field'
  );
}

/** Strips HTML tags and trims; never throws. Display/read path sanitization. */
export function sanitizeTextAnswer(value: string): string {
  return String(value).replace(HTML_TAG_GLOBAL_REGEX, '').trim();
}

interface ParsedOptions {
  options?: string[];
  min?: number;
  max?: number;
}

export function parseOptionsJson(optionsJson: Prisma.JsonValue | null): ParsedOptions {
  if (optionsJson === null || optionsJson === undefined) return {};
  if (!Array.isArray(optionsJson) && typeof optionsJson === 'object') {
    const obj = optionsJson as Record<string, unknown>;
    const out: ParsedOptions = {};
    if (Array.isArray(obj.options)) {
      out.options = obj.options.filter((o): o is string => typeof o === 'string');
    }
    if (typeof obj.min === 'number') out.min = obj.min;
    if (typeof obj.max === 'number') out.max = obj.max;
    return out;
  }
  return {};
}

function buildOptionsJson(type: CustomFieldType, input: FieldCreateInput | FieldUpdateInput) {
  if (type === 'SINGLE_SELECT') {
    const options = input.options ?? [];
    if (options.length === 0) {
      throw httpError(400, 'SINGLE_SELECT fields require at least one option');
    }
    return { options } as Prisma.InputJsonValue;
  }
  if (type === 'NUMBER') {
    const json: { min?: number; max?: number } = {};
    if (input.min !== undefined) json.min = input.min;
    if (input.max !== undefined) json.max = input.max;
    if (json.min !== undefined && json.max !== undefined && json.min > json.max) {
      throw httpError(400, 'NUMBER min cannot exceed max');
    }
    return Object.keys(json).length > 0 ? (json as Prisma.InputJsonValue) : Prisma.JsonNull;
  }
  return Prisma.JsonNull;
}

// ---------------------------------------------------------------------------
// Admin CRUD (archive-only — FR-423)
// ---------------------------------------------------------------------------

export async function listFields(): Promise<CustomFieldRecord[]> {
  const rows = await prisma.customBookingField.findMany({
    orderBy: [{ archivedAt: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
  return rows as CustomFieldRecord[];
}

export async function createField(input: FieldCreateInput, actor: StaffActorContext): Promise<CustomFieldRecord> {
  const activeCount = await prisma.customBookingField.count({ where: { archivedAt: null } });
  if (activeCount >= MAX_ACTIVE_CUSTOM_FIELDS) {
    throw httpError(
      422,
      `Cannot create field: instance already has ${MAX_ACTIVE_CUSTOM_FIELDS} active custom fields (limit ${MAX_ACTIVE_CUSTOM_FIELDS})`
    );
  }

  const key = `${slugify(input.label)}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

  const created = await prisma.customBookingField.create({
    data: {
      key,
      label: input.label,
      type: input.type,
      required: input.required ?? false,
      optionsJson: buildOptionsJson(input.type, input),
      boundItemIds: input.boundItemIds ?? [],
      sortOrder: input.sortOrder ?? 0,
    },
  });

  await emitAuditEvent({
    action: 'CUSTOM_FIELD_CREATED',
    actorId: actor.actorId,
    actorRole: actor.actorRole,
    aggregateType: 'CUSTOM_FIELD',
    aggregateId: created.id,
    reason: `Created custom booking field "${created.label}" (${created.type})`,
    metadataJson: { key: created.key, type: created.type, required: created.required },
  });

  return created as CustomFieldRecord;
}

export async function updateField(
  id: string,
  input: AdminFieldUpdateInput,
  actor: StaffActorContext
): Promise<CustomFieldRecord> {
  const existing = await prisma.customBookingField.findUnique({ where: { id } });
  if (!existing) throw httpError(404, `Field not found: ${id}`);

  const data: Prisma.CustomBookingFieldUpdateInput = {
    ...(input.label !== undefined ? { label: input.label } : {}),
    ...(input.required !== undefined ? { required: input.required } : {}),
    ...(input.boundItemIds !== undefined ? { boundItemIds: input.boundItemIds } : {}),
    ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
  };

  // options/min/max only meaningful for their types; keep existing otherwise.
  if (input.options !== undefined || input.min !== undefined || input.max !== undefined) {
    const merged: FieldCreateInput = {
      label: input.label ?? existing.label,
      type: existing.type as CustomFieldType,
      options: input.options ?? parseOptionsJson(existing.optionsJson).options,
      min: input.min ?? parseOptionsJson(existing.optionsJson).min,
      max: input.max ?? parseOptionsJson(existing.optionsJson).max,
    };
    if (existing.type === 'SINGLE_SELECT' || existing.type === 'NUMBER') {
      data.optionsJson = buildOptionsJson(existing.type as CustomFieldType, merged);
    }
  }

  // Archive-only lifecycle (FR-423): archived=true sets archivedAt,
  // archived=false re-activates (un-archives); no delete path exists.
  if (input.archived !== undefined) {
    data.archivedAt = input.archived ? new Date() : null;
  }

  const updated = await prisma.customBookingField.update({ where: { id }, data });

  await emitAuditEvent({
    action: input.archived === true ? 'CUSTOM_FIELD_ARCHIVED' : 'CUSTOM_FIELD_UPDATED',
    actorId: actor.actorId,
    actorRole: actor.actorRole,
    aggregateType: 'CUSTOM_FIELD',
    aggregateId: updated.id,
    reason: `Updated custom booking field "${updated.label}"`,
    metadataJson: { key: updated.key, archived: updated.archivedAt !== null },
  });

  return updated as CustomFieldRecord;
}

// ---------------------------------------------------------------------------
// Booking-form inclusion
// ---------------------------------------------------------------------------

/**
 * Active (non-archived) fields applicable to a service: instance-wide fields
 * (empty binding) plus fields explicitly bound to the given item.
 */
export async function getActiveFieldsForService(itemId: string): Promise<CustomFieldRecord[]> {
  const rows = await prisma.customBookingField.findMany({
    where: {
      archivedAt: null,
      OR: [{ boundItemIds: { isEmpty: true } }, { boundItemIds: { has: itemId } }],
    },
    orderBy: { sortOrder: 'asc' },
  });
  return rows as CustomFieldRecord[];
}

// ---------------------------------------------------------------------------
// Answer validation + snapshot persistence (FR-424/434)
// ---------------------------------------------------------------------------

export interface NormalizedAnswer {
  fieldId: string;
  labelSnapshot: string;
  typeSnapshot: CustomFieldType;
  valueText: string | null;
  valueNumber: number | null;
  valueBool: boolean | null;
}

interface RawAnswer {
  fieldId?: string;
  fieldKey?: string;
  value: CustomFieldAnswerValue;
}

/**
 * Validates raw customer answers against the active fields for a service.
 * Throws CustomFieldValidationError (HTTP 422) when a required answer is
 * missing or a value is invalid for its type/bounds. Text answers are
 * sanitized (HTML stripped) and capped at 1000 chars.
 */
export async function validateAnswersForService(
  itemId: string,
  answers: Record<string, CustomFieldAnswerValue> | RawAnswer[] | undefined
): Promise<NormalizedAnswer[]> {
  const fields = await getActiveFieldsForService(itemId);

  const rawList: RawAnswer[] = Array.isArray(answers)
    ? answers
    : Object.entries(answers ?? {}).map(([k, value]) => ({ fieldId: k, value }));

  // Answers may arrive keyed by field id or by field key; index both.
  const byId = new Map<string, CustomFieldAnswerValue>();
  const byKey = new Map<string, CustomFieldAnswerValue>();
  for (const raw of rawList) {
    const k = raw.fieldId ?? raw.fieldKey;
    if (!k) continue;
    byId.set(k, raw.value);
    byKey.set(k, raw.value);
  }

  const normalized: NormalizedAnswer[] = [];

  for (const field of fields) {
    const rawValue = byId.get(field.id) ?? byKey.get(field.key);
    const empty = rawValue === undefined || rawValue === null || rawValue === '';

    if (empty) {
      if (field.required) {
        throw new CustomFieldValidationError(
          'REQUIRED_FIELD_MISSING',
          `Missing required answer for field "${field.label}"`
        );
      }
      continue;
    }

    if (field.type === 'TEXT') {
      const sanitized = sanitizeTextAnswer(String(rawValue));
      if (!sanitized) continue;
      if (sanitized.length > MAX_TEXT_ANSWER_LENGTH) {
        throw new CustomFieldValidationError(
          'TEXT_ANSWER_TOO_LONG',
          `Answer for "${field.label}" exceeds ${MAX_TEXT_ANSWER_LENGTH} characters`
        );
      }
      normalized.push({
        fieldId: field.id,
        labelSnapshot: field.label,
        typeSnapshot: field.type,
        valueText: sanitized,
        valueNumber: null,
        valueBool: null,
      });
      continue;
    }

    if (field.type === 'NUMBER') {
      const num = typeof rawValue === 'number' ? rawValue : Number(rawValue);
      if (!Number.isFinite(num)) {
        throw new CustomFieldValidationError('INVALID_ANSWER', `Answer for "${field.label}" must be a number`);
      }
      const { min, max } = parseOptionsJson(field.optionsJson);
      if ((min !== undefined && num < min) || (max !== undefined && num > max)) {
        throw new CustomFieldValidationError(
          'ANSWER_OUT_OF_RANGE',
          `Answer for "${field.label}" must be between ${min ?? '-∞'} and ${max ?? '∞'}`
        );
      }
      normalized.push({
        fieldId: field.id,
        labelSnapshot: field.label,
        typeSnapshot: field.type,
        valueText: null,
        valueNumber: Math.trunc(num),
        valueBool: null,
      });
      continue;
    }

    if (field.type === 'SINGLE_SELECT') {
      const { options } = parseOptionsJson(field.optionsJson);
      const str = sanitizeTextAnswer(String(rawValue));
      if (!options || !options.includes(str)) {
        throw new CustomFieldValidationError(
          'INVALID_ANSWER',
          `Answer for "${field.label}" must be one of the predefined options`
        );
      }
      normalized.push({
        fieldId: field.id,
        labelSnapshot: field.label,
        typeSnapshot: field.type,
        valueText: str,
        valueNumber: null,
        valueBool: null,
      });
      continue;
    }

    // CHECKBOX
    if (typeof rawValue !== 'boolean') {
      throw new CustomFieldValidationError('INVALID_ANSWER', `Answer for "${field.label}" must be true or false`);
    }
    normalized.push({
      fieldId: field.id,
      labelSnapshot: field.label,
      typeSnapshot: field.type,
      valueText: null,
      valueNumber: null,
      valueBool: rawValue,
    });
  }

  return normalized;
}

/**
 * Persists validated answers onto a reservation with immutable definition
 * snapshots (labelSnapshot/typeSnapshot). Existing answer rows are never
 * re-snapshotted — only the value column updates (snapshot immutability).
 */
export async function persistBookingAnswers(
  reservationId: string,
  normalized: NormalizedAnswer[]
): Promise<number> {
  for (const answer of normalized) {
    await prisma.bookingFieldAnswer.upsert({
      where: {
        slotReservationId_fieldId: { slotReservationId: reservationId, fieldId: answer.fieldId },
      },
      create: {
        slotReservationId: reservationId,
        fieldId: answer.fieldId,
        labelSnapshot: answer.labelSnapshot,
        typeSnapshot: answer.typeSnapshot,
        valueText: answer.valueText,
        valueNumber: answer.valueNumber,
        valueBool: answer.valueBool,
      },
      update: {
        valueText: answer.valueText,
        valueNumber: answer.valueNumber,
        valueBool: answer.valueBool,
      },
    });
  }
  return normalized.length;
}

/** Sanitized answers for staff display (FR-424). Label/text are tag-stripped. */
export async function getAnswersForBookings(
  reservationIds: string[]
): Promise<Record<string, { label: string; type: CustomFieldType; value: string }[]>> {
  if (reservationIds.length === 0) return {};
  const rows = await prisma.bookingFieldAnswer.findMany({
    where: { slotReservationId: { in: reservationIds } },
    orderBy: { id: 'asc' },
  });

  const out: Record<string, { label: string; type: CustomFieldType; value: string }[]> = {};
  for (const row of rows) {
    const value =
      row.typeSnapshot === 'CHECKBOX'
        ? row.valueBool
          ? 'Yes'
          : 'No'
        : row.typeSnapshot === 'NUMBER' && row.valueNumber !== null
        ? String(row.valueNumber)
        : sanitizeTextAnswer(row.valueText ?? '');
    (out[row.slotReservationId] ??= []).push({
      label: sanitizeTextAnswer(row.labelSnapshot),
      type: row.typeSnapshot as CustomFieldType,
      value,
    });
  }
  return out;
}
