'use client';

/**
 * Admin Settings (T064, US9, FR-438, FR-442)
 * Foundation section (currency, timeZone, defaultLocale, enabledLocales):
 * OWNER-only — hidden in UI for non-OWNER but ALWAYS server-enforced via
 * PATCH /api/admin/settings. Operational section for OPERATOR+.
 * Currency gate (FR-438): currency change → confirm dialog → PATCH
 * { currencyConfirmed: true }.
 */

import React, { useCallback, useEffect, useState } from 'react';
import AdminNav from '@/components/admin/AdminNav';

interface ShopSettings {
  currency?: string;
  currencyConfirmed?: boolean;
  timeZone?: string;
  defaultLocale?: string;
  enabledLocales?: string[];
  confirmationNoticeHours?: number;
  requireStaffApprovalForInCall?: boolean;
  slotGridStepMin?: number;
}

const TIMEZONES = ['UTC', 'Europe/Moscow', 'Asia/Yerevan', 'Europe/Berlin', 'America/New_York'];
const LOCALES = ['en', 'ru', 'hy'];

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<ShopSettings>({});
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Foundation drafts (OWNER only)
  const [currency, setCurrency] = useState('');
  const [timeZone, setTimeZone] = useState('UTC');
  const [defaultLocale, setDefaultLocale] = useState('en');
  const [enabledLocales, setEnabledLocales] = useState<string[]>(['en']);

  // Operational drafts
  const [confirmationNoticeHours, setConfirmationNoticeHours] = useState(24);
  const [requireStaffApprovalForInCall, setRequireStaffApprovalForInCall] = useState(false);
  const [slotGridStepMin, setSlotGridStepMin] = useState(30);

  const isOwner = role === 'OWNER';

  const load = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      // Session role: derived from a profiles fetch (PERFORMER sees only own)
      const [settingsRes, roleRes] = await Promise.all([
        fetch('/api/admin/settings'),
        fetch('/api/admin/staff/me').catch(() => null),
      ]);
      if (settingsRes.status === 401) throw new Error('Please sign in with staff credentials');
      if (!settingsRes.ok) {
        const data = await settingsRes.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to load settings');
      }
      const data = await settingsRes.json();
      const s: ShopSettings = data.settings || {};
      setSettings(s);
      setCurrency(s.currency || '');
      setTimeZone(s.timeZone || 'UTC');
      setDefaultLocale(s.defaultLocale || 'en');
      setEnabledLocales(s.enabledLocales || ['en']);
      setConfirmationNoticeHours(s.confirmationNoticeHours ?? 24);
      setRequireStaffApprovalForInCall(s.requireStaffApprovalForInCall ?? false);
      setSlotGridStepMin(s.slotGridStepMin === 15 ? 15 : 30);

      if (roleRes && roleRes.ok) {
        const me = await roleRes.json();
        setRole(me.role || me.staffMember?.role || null);
      } else {
        // Fallback: unknown role — UI hides foundation but server still enforces
        setRole(null);
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Error loading settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function patch(body: Record<string, unknown>): Promise<boolean> {
    const res = await fetch('/api/admin/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Save failed (${res.status})`);
    }
    const data = await res.json();
    setSettings(data.settings || {});
    return true;
  }

  async function saveOperational() {
    setSaving(true);
    setNotice(null);
    try {
      await patch({
        confirmationNoticeHours,
        requireStaffApprovalForInCall,
        slotGridStepMin,
      });
      setNotice('Operational settings saved.');
    } catch (err: unknown) {
      setNotice(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function saveFoundation() {
    setSaving(true);
    setNotice(null);
    try {
      const currencyChanged = currency.toUpperCase() !== (settings.currency || '').toUpperCase();
      await patch({
        currency: currency.toUpperCase(),
        timeZone,
        defaultLocale,
        enabledLocales,
      });
      if (currencyChanged) {
        // FR-438 confirm gate: change saved with currencyConfirmed=false;
        // confirmation is an explicit OWNER action.
        const confirmed = confirm(
          `Change currency to ${currency.toUpperCase()}? Existing prices will be reinterpreted in the new currency. Confirm to enable this currency.`
        );
        if (confirmed) {
          await patch({ currencyConfirmed: true });
          setNotice('Currency changed and confirmed.');
        } else {
          setNotice('Currency saved but NOT confirmed — confirm later from this page.');
        }
      } else {
        setNotice('Foundation settings saved.');
      }
      await load();
    } catch (err: unknown) {
      setNotice(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function confirmCurrency() {
    setSaving(true);
    setNotice(null);
    try {
      await patch({ currencyConfirmed: true });
      setNotice('Currency confirmed.');
      await load();
    } catch (err: unknown) {
      setNotice(err instanceof Error ? err.message : 'Confirm failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 text-base-content pb-24">
      <div className="border-b border-base-300 pb-4 mb-4">
        <h1 className="text-xl font-extrabold tracking-tight">Settings</h1>
        <p className="text-xs text-base-content/60 pt-1">Shop foundation and operational parameters</p>
      </div>

      {errorMsg && (
        <div className="p-4 bg-error-surface/40 border border-error/60 rounded-xl text-xs text-error mb-4">
          {errorMsg}
        </div>
      )}
      {notice && (
        <div className="p-3 bg-base-200 border border-base-300 rounded-xl text-xs text-base-content/80 mb-4">{notice}</div>
      )}
      {loading && <p className="text-sm text-base-content/60">Loading…</p>}

      {!loading && isOwner && (
        <section className="bg-base-200 border border-base-300 rounded-xl p-4 space-y-3 mb-4">
          <div className="flex justify-between items-center">
            <h2 className="text-sm font-bold">Foundation</h2>
            <span className="text-[11px] text-base-content/50 uppercase tracking-wide">Owner only</span>
          </div>

          {settings.currency && settings.currencyConfirmed === false && (
            <div className="p-3 bg-yellow-900/30 border border-yellow-700/60 rounded-lg text-xs text-yellow-200 flex items-center justify-between gap-2">
              <span>Currency {settings.currency} is not confirmed yet.</span>
              <button
                onClick={() => void confirmCurrency()}
                disabled={saving}
                className="bg-yellow-600 hover:bg-yellow-500 text-black font-semibold px-3 py-1 rounded-lg disabled:opacity-50"
              >
                Confirm currency
              </button>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-base-content/60 mb-1">Currency (ISO 4217)</label>
            <input
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              maxLength={4}
              className="w-full bg-base-300 border border-base-300 rounded-lg px-3 py-2 text-sm"
              placeholder="USD"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-base-content/60 mb-1">Time zone</label>
            <select
              value={timeZone}
              onChange={(e) => setTimeZone(e.target.value)}
              className="w-full bg-base-300 border border-base-300 rounded-lg px-3 py-2 text-sm"
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-base-content/60 mb-1">Default locale</label>
            <select
              value={defaultLocale}
              onChange={(e) => setDefaultLocale(e.target.value)}
              className="w-full bg-base-300 border border-base-300 rounded-lg px-3 py-2 text-sm"
            >
              {LOCALES.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-base-content/60 mb-1">Enabled locales</label>
            <div className="flex gap-2">
              {LOCALES.map((l) => {
                const active = enabledLocales.includes(l);
                return (
                  <button
                    key={l}
                    type="button"
                    aria-pressed={active}
                    onClick={() =>
                      setEnabledLocales(
                        active ? enabledLocales.filter((x) => x !== l) : [...enabledLocales, l]
                      )
                    }
                    className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                      active
                        ? 'bg-purple-600 border-purple-400 text-white'
                        : 'bg-base-300 border-base-300 text-base-content/60'
                    }`}
                  >
                    {l}
                  </button>
                );
              })}
            </div>
          </div>

          <button
            onClick={() => void saveFoundation()}
            disabled={saving}
            className="w-full bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
          >
            {saving ? 'Saving…' : 'Save Foundation'}
          </button>
        </section>
      )}

      {!loading && (
        <section className="bg-base-200 border border-base-300 rounded-xl p-4 space-y-3">
          <div className="flex justify-between items-center">
            <h2 className="text-sm font-bold">Operational</h2>
            <span className="text-[11px] text-base-content/50 uppercase tracking-wide">Operator +</span>
          </div>

          <div>
            <label className="block text-xs font-medium text-base-content/60 mb-1">Confirmation notice (hours before)</label>
            <input
              type="number"
              min={1}
              max={168}
              value={confirmationNoticeHours}
              onChange={(e) => setConfirmationNoticeHours(Number(e.target.value))}
              className="w-full bg-base-300 border border-base-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-base-content/80">
            <input
              type="checkbox"
              checked={requireStaffApprovalForInCall}
              onChange={(e) => setRequireStaffApprovalForInCall(e.target.checked)}
              className="accent-purple-600"
            />
            Require staff approval for IN_CALL bookings
          </label>

          <div>
            <label className="block text-xs font-medium text-base-content/60 mb-1">Slot grid step (FR-442)</label>
            <div className="flex gap-2">
              {[15, 30].map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={slotGridStepMin === v}
                  onClick={() => setSlotGridStepMin(v)}
                  className={`text-xs px-4 py-1.5 rounded-lg border transition-colors ${
                    slotGridStepMin === v
                      ? 'bg-purple-600 border-purple-400 text-white'
                      : 'bg-base-300 border-base-300 text-base-content/60'
                  }`}
                >
                  {v} min
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={() => void saveOperational()}
            disabled={saving}
            className="w-full bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
          >
            {saving ? 'Saving…' : 'Save Operational'}
          </button>
        </section>
      )}

      <AdminNav />
    </div>
  );
}
