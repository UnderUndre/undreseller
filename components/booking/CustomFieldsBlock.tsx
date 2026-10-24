'use client';

/**
 * Dynamic custom-field block on the booking form (T081, US6, FR-423).
 * Renders the active fields bound to the selected service and lifts the
 * customer's answers to the parent form via onAnswersChange. Client-side
 * required enforcement blocks submission; server re-validates (FR-434).
 */

import React from 'react';
import { useTranslations } from 'next-intl';

export interface BookingCustomField {
  id: string;
  key: string;
  label: string;
  type: 'TEXT' | 'NUMBER' | 'SINGLE_SELECT' | 'CHECKBOX';
  required: boolean;
  optionsJson: { options?: string[]; min?: number; max?: number } | null;
}

export type CustomAnswers = Record<string, string | number | boolean>;

const MAX_TEXT_ANSWER_LENGTH = 1000;

export default function CustomFieldsBlock({
  fields,
  answers,
  onChange,
}: {
  fields: BookingCustomField[];
  answers: CustomAnswers;
  onChange: (answers: CustomAnswers) => void;
}) {
  // T040 (FR-411): block chrome; field labels/options are admin-authored content (FR-414).
  const t = useTranslations('web.booking');

  if (fields.length === 0) return null;

  function update(key: string, value: string | number | boolean) {
    onChange({ ...answers, [key]: value });
  }

  const inputClass =
    'w-full bg-base-100 border border-base-300 rounded-xl px-3.5 py-2 text-sm text-base-content focus:outline-none focus:border-purple-500';

  return (
    <div className="space-y-4 pt-2 border-t border-base-300">
      <label className="block text-xs font-semibold uppercase tracking-wider text-base-content/60">
        {t('additionalDetails')}
      </label>
      {fields.map((field) => {
        const value = answers[field.key];
        return (
          <div key={field.id} className="space-y-1.5">
            <label className="block text-xs font-semibold text-base-content/60">
              {field.label}
              {field.required && ' *'}
            </label>

            {field.type === 'TEXT' && (
              <textarea
                rows={2}
                maxLength={MAX_TEXT_ANSWER_LENGTH}
                required={field.required}
                value={typeof value === 'string' ? value : ''}
                onChange={(e) => update(field.key, e.target.value)}
                className={inputClass}
              />
            )}

            {field.type === 'NUMBER' && (
              <input
                type="number"
                required={field.required}
                min={field.optionsJson?.min}
                max={field.optionsJson?.max}
                value={typeof value === 'number' || typeof value === 'string' ? String(value ?? '') : ''}
                onChange={(e) =>
                  update(field.key, e.target.value === '' ? '' : Number(e.target.value))
                }
                className={inputClass}
              />
            )}

            {field.type === 'SINGLE_SELECT' && (
              <select
                required={field.required}
                value={typeof value === 'string' ? value : ''}
                onChange={(e) => update(field.key, e.target.value)}
                className={inputClass}
              >
                <option value="">{t('selectOption')}</option>
                {(field.optionsJson?.options ?? []).map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            )}

            {field.type === 'CHECKBOX' && (
              <label className="flex items-center gap-2 text-sm text-base-content/80">
                <input
                  type="checkbox"
                  checked={value === true}
                  onChange={(e) => update(field.key, e.target.checked)}
                  className="accent-purple-600"
                />
                {t('yes')}
              </label>
            )}
          </div>
        );
      })}
    </div>
  );
}
