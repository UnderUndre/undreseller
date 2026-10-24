'use client';

/**
 * Admin custom booking field editor (T081, US6, FR-423).
 * Mobile-first list + create/edit sheet + one-tap archive toggle.
 * Archive-only lifecycle: no hard delete (FR-423).
 */

import React, { useCallback, useEffect, useState } from 'react';
import AdminNav from '@/components/admin/AdminNav';

interface AdminField {
  id: string;
  key: string;
  label: string;
  type: 'TEXT' | 'NUMBER' | 'SINGLE_SELECT' | 'CHECKBOX';
  required: boolean;
  optionsJson: { options?: string[]; min?: number; max?: number } | null;
  boundItemIds: string[];
  sortOrder: number;
  archivedAt: string | null;
}

const FIELD_TYPES = ['TEXT', 'NUMBER', 'SINGLE_SELECT', 'CHECKBOX'] as const;
const MAX_ACTIVE_CUSTOM_FIELDS = 10;

interface FormState {
  id: string | null;
  label: string;
  type: (typeof FIELD_TYPES)[number];
  required: boolean;
  options: string;
  min: string;
  max: string;
  boundItemIds: string;
}

const emptyForm: FormState = {
  id: null,
  label: '',
  type: 'TEXT',
  required: false,
  options: '',
  min: '',
  max: '',
  boundItemIds: '',
};

export default function AdminFieldsPage() {
  const [fields, setFields] = useState<AdminField[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);

  const loadFields = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/admin/fields');
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to load fields');
      }
      const data = await res.json();
      setFields(data.fields || []);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Error loading fields');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFields();
  }, [loadFields]);

  function startCreate() {
    setNotice(null);
    setForm({ ...emptyForm });
  }

  function startEdit(field: AdminField) {
    setNotice(null);
    const opts = field.optionsJson ?? {};
    setForm({
      id: field.id,
      label: field.label,
      type: field.type,
      required: field.required,
      options: (opts.options ?? []).join(', '),
      min: opts.min !== undefined ? String(opts.min) : '',
      max: opts.max !== undefined ? String(opts.max) : '',
      boundItemIds: field.boundItemIds.join(', '),
    });
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    setErrorMsg(null);
    try {
      const options = form.options
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const body: Record<string, unknown> = {
        label: form.label.trim(),
        type: form.type,
        required: form.required,
      };
      if (form.type === 'SINGLE_SELECT') body.options = options;
      if (form.type === 'NUMBER') {
        if (form.min.trim()) body.min = Number(form.min);
        if (form.max.trim()) body.max = Number(form.max);
      }
      const boundItemIds = form.boundItemIds
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (boundItemIds.length > 0) body.boundItemIds = boundItemIds;

      const res = form.id
        ? await fetch(`/api/admin/fields/${form.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
        : await fetch('/api/admin/fields', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Save failed');
      }
      setForm(null);
      setNotice(form.id ? 'Field updated.' : 'Field created.');
      await loadFields();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleArchiveToggle(field: AdminField) {
    const archiving = field.archivedAt === null;
    if (!confirm(archiving ? `Archive "${field.label}"? Historical answers are preserved.` : `Re-activate "${field.label}"?`))
      return;
    try {
      const res = await fetch(`/api/admin/fields/${field.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: archiving }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Archive toggle failed');
      }
      await loadFields();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Archive toggle failed');
    }
  }

  const activeCount = fields.filter((f) => f.archivedAt === null).length;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 pb-28 space-y-6 text-base-content">
      <div className="flex justify-between items-start gap-3 border-b border-base-300 pb-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Booking Fields</h1>
          <p className="text-xs text-base-content/60 pt-1">
            Custom questions on the booking form — up to {MAX_ACTIVE_CUSTOM_FIELDS} active. Archiving
            keeps historical answers.
          </p>
        </div>
        <button
          onClick={startCreate}
          disabled={activeCount >= MAX_ACTIVE_CUSTOM_FIELDS}
          className="bg-purple-600 hover:bg-purple-500 disabled:bg-base-300 disabled:text-base-content/50 text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors whitespace-nowrap"
        >
          + Add Field
        </button>
      </div>

      {notice && (
        <div className="p-3 bg-green-900/40 border border-green-700/60 rounded-xl text-xs text-green-300">
          {notice}
        </div>
      )}
      {errorMsg && (
        <div className="p-3 bg-error-surface/40 border border-error/60 rounded-xl text-xs text-error">
          {errorMsg}
        </div>
      )}

      {/* Create / edit form */}
      {form && (
        <form onSubmit={handleSave} className="bg-base-200/60 border border-base-300 rounded-xl p-4 space-y-3">
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-base-content/60">Label *</label>
            <input
              required
              maxLength={200}
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              placeholder="e.g. Floor number"
              className="w-full bg-base-100 border border-base-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-base-content/60">Type *</label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as FormState['type'] })}
                className="w-full bg-base-100 border border-base-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
              >
                {FIELD_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex items-end gap-2 pb-2 text-xs text-base-content/80">
              <input
                type="checkbox"
                checked={form.required}
                onChange={(e) => setForm({ ...form, required: e.target.checked })}
                className="accent-purple-600"
              />
              Required
            </label>
          </div>

          {form.type === 'SINGLE_SELECT' && (
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-base-content/60">Options (comma-separated) *</label>
              <input
                value={form.options}
                onChange={(e) => setForm({ ...form, options: e.target.value })}
                placeholder="Morning, Afternoon, Evening"
                className="w-full bg-base-100 border border-base-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
              />
            </div>
          )}

          {form.type === 'NUMBER' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-base-content/60">Min</label>
                <input
                  type="number"
                  value={form.min}
                  onChange={(e) => setForm({ ...form, min: e.target.value })}
                  className="w-full bg-base-100 border border-base-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-base-content/60">Max</label>
                <input
                  type="number"
                  value={form.max}
                  onChange={(e) => setForm({ ...form, max: e.target.value })}
                  className="w-full bg-base-100 border border-base-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-purple-500"
                />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-base-content/60">
              Bound service IDs (comma-separated, empty = all services)
            </label>
            <input
              value={form.boundItemIds}
              onChange={(e) => setForm({ ...form, boundItemIds: e.target.value })}
              placeholder="leave empty for instance-wide"
              className="w-full bg-base-100 border border-base-300 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:border-purple-500"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="bg-purple-600 hover:bg-purple-500 disabled:bg-base-300 text-white text-xs font-semibold px-4 py-2 rounded-lg"
            >
              {saving ? 'Saving…' : form.id ? 'Save Changes' : 'Create Field'}
            </button>
            <button
              type="button"
              onClick={() => setForm(null)}
              className="bg-base-300 hover:bg-base-300 text-xs font-medium px-4 py-2 rounded-lg"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Field list */}
      {loading ? (
        <div className="text-center py-12 text-sm text-base-content/60 animate-pulse">Loading fields…</div>
      ) : fields.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-base-300 rounded-xl">
          <p className="text-xs text-base-content/60">No custom fields yet. Add one to collect extra answers at booking.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {fields.map((field) => (
            <li
              key={field.id}
              className={`border rounded-xl p-3 flex items-center justify-between gap-3 ${
                field.archivedAt ? 'border-base-300 bg-base-200/30 opacity-60' : 'border-base-300 bg-base-200/60'
              }`}
            >
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate">
                  {field.label}
                  {field.required && <span className="text-error ml-1">*</span>}
                </div>
                <div className="text-[11px] text-base-content/60 font-mono truncate">
                  {field.type}
                  {field.boundItemIds.length === 0 ? ' · all services' : ` · ${field.boundItemIds.length} service(s)`}
                </div>
              </div>
              <div className="flex gap-1.5 whitespace-nowrap">
                <button
                  onClick={() => startEdit(field)}
                  disabled={field.archivedAt !== null}
                  className="bg-base-300 hover:bg-base-300 disabled:opacity-40 text-[11px] font-medium px-2.5 py-1.5 rounded-lg"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleArchiveToggle(field)}
                  className={`text-[11px] font-medium px-2.5 py-1.5 rounded-lg ${
                    field.archivedAt
                      ? 'bg-green-600 hover:bg-green-500'
                      : 'bg-error hover:bg-error text-base-content'
                  }`}
                >
                  {field.archivedAt ? 'Restore' : 'Archive'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <AdminNav />
    </div>
  );
}
