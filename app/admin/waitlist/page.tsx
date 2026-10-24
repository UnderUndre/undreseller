'use client';

/**
 * Admin waitlist outcomes (T072, US5, FR-422): minimal outcome counters —
 * offers by status, entries by status, recovered slots.
 */

import React, { useState, useEffect } from 'react';

interface WaitlistStats {
  offers: Record<string, number>;
  entries: Record<string, number>;
  recoveredSlots: number;
  offersSent: number;
}

const OFFER_LABELS: Record<string, string> = {
  SENT: 'Awaiting claim',
  CLAIMED: 'Claimed',
  TAKEN: 'Lost to another claim',
  EXPIRED: 'Expired silently',
};

const ENTRY_LABELS: Record<string, string> = {
  ACTIVE: 'Active entries',
  NOTIFIED: 'Notified (offer claimed)',
  FULFILLED: 'Fulfilled',
  EXPIRED: 'Expired',
  CANCELLED: 'Cancelled',
};

export default function AdminWaitlistPage() {
  const [stats, setStats] = useState<WaitlistStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/waitlist/stats');
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Failed to load waitlist stats');
        }
        setStats(await res.json());
      } catch (err: unknown) {
        setErrorMsg(err instanceof Error ? err.message : 'Error loading waitlist stats');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 pb-24 space-y-6">
      <h1 className="text-xl font-bold text-base-content">Waitlist outcomes</h1>

      {loading && <p className="text-sm text-base-content/60">Loading…</p>}
      {errorMsg && (
        <div className="p-3 bg-error-surface/40 border border-error/60 rounded-xl text-xs text-error">
          {errorMsg}
        </div>
      )}

      {stats && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-base-200 border border-base-300 rounded-xl p-4">
              <p className="text-2xl font-extrabold text-success">{stats.recoveredSlots}</p>
              <p className="text-xs text-base-content/60">Slots recovered (claims)</p>
            </div>
            <div className="bg-base-200 border border-base-300 rounded-xl p-4">
              <p className="text-2xl font-extrabold text-base-content">{stats.offersSent}</p>
              <p className="text-xs text-base-content/60">Offers sent</p>
            </div>
          </div>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-base-content/80">Offers by status</h2>
            <div className="bg-base-200 border border-base-300 rounded-xl divide-y divide-base-300">
              {Object.entries(OFFER_LABELS).map(([status, label]) => (
                <div key={status} className="flex justify-between px-4 py-2.5 text-sm">
                  <span className="text-base-content/60">{label}</span>
                  <span className="font-semibold">{stats.offers[status] ?? 0}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-base-content/80">Entries by status</h2>
            <div className="bg-base-200 border border-base-300 rounded-xl divide-y divide-base-300">
              {Object.entries(ENTRY_LABELS).map(([status, label]) => (
                <div key={status} className="flex justify-between px-4 py-2.5 text-sm">
                  <span className="text-base-content/60">{label}</span>
                  <span className="font-semibold">{stats.entries[status] ?? 0}</span>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
