'use client';

/**
 * Admin Catalog (T061, US9, FR-436/439/440)
 * Mobile-first service list: one-tap active toggle, arrow reorder,
 * quick-create sheet with 4 required fields + collapsed "more".
 * Validation uses the SAME zod schemas as the API (lib/validation/adminSchemas).
 */

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { adminServiceCreateSchema, adminServiceUpdateSchema } from '@/lib/validation/adminSchemas';
import AdminNav from '@/components/admin/AdminNav';

interface AdminService {
  id: string;
  title: string;
  description: string;
  durationMin: number;
  priceMinor: number;
  isActive: boolean;
  sortOrder: number;
  bufferBeforeMin: number;
  bufferAfterMin: number;
  requiresFullPrepayment: boolean;
}

const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120, 180, 240];

export default function AdminCatalogPage() {
  const [services, setServices] = useState<AdminService[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Quick-create sheet state
  const [sheetOpen, setSheetOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [form, setForm] = useState({
    title: '',
    price: '',
    durationMin: 60,
    itemType: 'SERVICE',
    description: '',
    bufferBeforeMin: 0,
    bufferAfterMin: 0,
    requiresFullPrepayment: false,
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/admin/services');
      if (res.status === 401) throw new Error('Please sign in with staff credentials');
      if (res.status === 403) throw new Error('Your role cannot view the catalog');
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to load catalog');
      }
      const data = await res.json();
      setServices(data.services || []);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Error loading catalog');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function patchService(id: string, body: unknown) {
    // Client-side parity check before hitting the API
    const parsed = adminServiceUpdateSchema.safeParse(body);
    if (!parsed.success) {
      setNotice('Validation failed client-side');
      return;
    }
    const res = await fetch(`/api/admin/services/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed.data),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Update failed (${res.status})`);
    }
  }

  async function toggleActive(service: AdminService) {
    try {
      await patchService(service.id, { isActive: !service.isActive });
      await load();
    } catch (err: unknown) {
      setNotice(err instanceof Error ? err.message : 'Toggle failed');
    }
  }

  async function reorder(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= services.length) return;
    const a = services[index];
    const b = services[target];
    try {
      // Swap sortOrder values between neighbours
      await patchService(a.id, { sortOrder: b.sortOrder });
      await patchService(b.id, { sortOrder: a.sortOrder });
      await load();
    } catch (err: unknown) {
      setNotice(err instanceof Error ? err.message : 'Reorder failed');
    }
  }

  function validateQuickCreate(): boolean {
    const errors: Record<string, string> = {};
    const candidate = {
      title: form.title,
      priceMinor: Number(form.price),
      durationMin: form.durationMin,
      description: form.description,
      bufferBeforeMin: form.bufferBeforeMin,
      bufferAfterMin: form.bufferAfterMin,
      requiresFullPrepayment: form.requiresFullPrepayment,
    };
    const parsed = adminServiceCreateSchema.safeParse({
      ...candidate,
      price: undefined,
      priceMinor: Number.isFinite(candidate.priceMinor) ? candidate.priceMinor : -1,
    });
    if (!parsed.success) {
      const flat = parsed.error.flatten().fieldErrors;
      if (flat.title?.length) errors.title = flat.title[0];
      if (flat.priceMinor?.length) errors.price = 'Price must be a non-negative integer (minor units)';
      if (flat.durationMin?.length) errors.durationMin = flat.durationMin[0];
    }
    if (form.itemType !== 'SERVICE') {
      errors.itemType = 'Only SERVICE items are supported in the catalog quick-create';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function submitQuickCreate(e: React.FormEvent) {
    e.preventDefault();
    setNotice(null);
    if (!validateQuickCreate()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title,
          priceMinor: Number(form.price),
          durationMin: form.durationMin,
          description: form.description,
          bufferBeforeMin: form.bufferBeforeMin,
          bufferAfterMin: form.bufferAfterMin,
          requiresFullPrepayment: form.requiresFullPrepayment,
          isActive: true,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Create failed (${res.status})`);
      }
      setSheetOpen(false);
      setMoreOpen(false);
      setForm({
        title: '',
        price: '',
        durationMin: 60,
        itemType: 'SERVICE',
        description: '',
        bufferBeforeMin: 0,
        bufferAfterMin: 0,
        requiresFullPrepayment: false,
      });
      setFormErrors({});
      await load();
    } catch (err: unknown) {
      setNotice(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 text-base-content pb-24">
      <div className="flex justify-between items-center border-b border-base-300 pb-4 mb-4">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight">Catalog</h1>
          <p className="text-xs text-base-content/60 pt-1">Services, pricing and ordering (FR-436)</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/" className="text-xs bg-base-300 hover:bg-base-300 px-3 py-1.5 rounded-lg transition-colors">
            Public Site
          </Link>
          <button
            onClick={() => setSheetOpen(true)}
            className="text-xs bg-purple-600 hover:bg-purple-500 font-medium px-3 py-1.5 rounded-lg transition-colors"
          >
            + New Service
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 bg-error-surface/40 border border-error/60 rounded-xl text-xs text-error mb-4">
          {errorMsg}
          {errorMsg.includes('sign in') && (
            <>
              {' '}
              <Link href="/admin/login" className="underline text-purple-400">
                Go to login
              </Link>
            </>
          )}
        </div>
      )}
      {notice && (
        <div className="p-3 bg-base-200 border border-base-300 rounded-xl text-xs text-base-content/80 mb-4">{notice}</div>
      )}

      {loading ? (
        <p className="text-sm text-base-content/60">Loading…</p>
      ) : (
        <ul className="space-y-2">
          {services.map((s, i) => (
            <li
              key={s.id}
              className="bg-base-200 border border-base-300 rounded-xl p-3 flex items-center gap-3"
            >
              <div className="flex flex-col gap-1">
                <button
                  aria-label={`Move ${s.title} up`}
                  disabled={i === 0}
                  onClick={() => void reorder(i, -1)}
                  className="text-base-content/60 hover:text-base-content disabled:opacity-30 text-xs px-1"
                >
                  ▲
                </button>
                <button
                  aria-label={`Move ${s.title} down`}
                  disabled={i === services.length - 1}
                  onClick={() => void reorder(i, 1)}
                  className="text-base-content/60 hover:text-base-content disabled:opacity-30 text-xs px-1"
                >
                  ▼
                </button>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{s.title}</p>
                <p className="text-xs text-base-content/60">
                  {(s.priceMinor / 100).toFixed(2)} · {s.durationMin} min
                  {s.requiresFullPrepayment ? ' · prepaid' : ''}
                </p>
              </div>
              <button
                onClick={() => void toggleActive(s)}
                aria-pressed={s.isActive}
                className={`relative w-11 h-6 rounded-full transition-colors ${
                  s.isActive ? 'bg-purple-600' : 'bg-base-300'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                    s.isActive ? 'translate-x-5' : ''
                  }`}
                />
              </button>
            </li>
          ))}
          {services.length === 0 && <li className="text-sm text-base-content/60">No services yet.</li>}
        </ul>
      )}

      {/* Quick-create sheet */}
      {sheetOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" role="dialog" aria-modal="true">
          <form
            onSubmit={submitQuickCreate}
            className="w-full max-w-3xl bg-base-200 border-t border-base-300 rounded-t-2xl p-4 space-y-3 max-h-[85vh] overflow-y-auto"
          >
            <div className="flex justify-between items-center">
              <h2 className="text-base font-bold">New Service</h2>
              <button type="button" onClick={() => setSheetOpen(false)} className="text-xs text-base-content/60 hover:text-base-content">
                Cancel
              </button>
            </div>

            <div>
              <label className="block text-xs font-medium text-base-content/60 mb-1">Title *</label>
              <input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full bg-base-300 border border-base-300 rounded-lg px-3 py-2 text-sm"
                placeholder="Deep tissue massage"
              />
              {formErrors.title && <p className="text-xs text-error mt-1">{formErrors.title}</p>}
            </div>

            <div>
              <label className="block text-xs font-medium text-base-content/60 mb-1">Price (minor units) *</label>
              <input
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                inputMode="numeric"
                className="w-full bg-base-300 border border-base-300 rounded-lg px-3 py-2 text-sm"
                placeholder="5000 = 50.00"
              />
              {formErrors.price && <p className="text-xs text-error mt-1">{formErrors.price}</p>}
            </div>

            <div>
              <label className="block text-xs font-medium text-base-content/60 mb-1">Duration (15-min steps) *</label>
              <div className="flex flex-wrap gap-2">
                {DURATION_OPTIONS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setForm({ ...form, durationMin: d })}
                    className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                      form.durationMin === d
                        ? 'bg-purple-600 border-purple-400 text-white'
                        : 'bg-base-300 border-base-300 text-base-content/60'
                    }`}
                  >
                    {d}m
                  </button>
                ))}
              </div>
              {formErrors.durationMin && <p className="text-xs text-error mt-1">{formErrors.durationMin}</p>}
            </div>

            <div>
              <label className="block text-xs font-medium text-base-content/60 mb-1">Type *</label>
              <select
                value={form.itemType}
                onChange={(e) => setForm({ ...form, itemType: e.target.value })}
                className="w-full bg-base-300 border border-base-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="SERVICE">Service</option>
              </select>
              {formErrors.itemType && <p className="text-xs text-error mt-1">{formErrors.itemType}</p>}
            </div>

            <button
              type="button"
              onClick={() => setMoreOpen(!moreOpen)}
              className="text-xs text-purple-400 underline"
            >
              {moreOpen ? 'Hide more options' : 'More options'}
            </button>

            {moreOpen && (
              <div className="space-y-3 border-t border-base-300 pt-3">
                <div>
                  <label className="block text-xs font-medium text-base-content/60 mb-1">Description</label>
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    rows={2}
                    className="w-full bg-base-300 border border-base-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-base-content/60 mb-1">Buffer before (min)</label>
                    <input
                      type="number"
                      min={0}
                      max={120}
                      value={form.bufferBeforeMin}
                      onChange={(e) => setForm({ ...form, bufferBeforeMin: Number(e.target.value) })}
                      className="w-full bg-base-300 border border-base-300 rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-base-content/60 mb-1">Buffer after (min)</label>
                    <input
                      type="number"
                      min={0}
                      max={120}
                      value={form.bufferAfterMin}
                      onChange={(e) => setForm({ ...form, bufferAfterMin: Number(e.target.value) })}
                      className="w-full bg-base-300 border border-base-300 rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm text-base-content/80">
                  <input
                    type="checkbox"
                    checked={form.requiresFullPrepayment}
                    onChange={(e) => setForm({ ...form, requiresFullPrepayment: e.target.checked })}
                    className="accent-purple-600"
                  />
                  Requires full prepayment
                </label>
              </div>
            )}

            <button
              type="submit"
              disabled={saving}
              className="w-full bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
            >
              {saving ? 'Saving…' : 'Create Service'}
            </button>
          </form>
        </div>
      )}

      <AdminNav />
    </div>
  );
}
