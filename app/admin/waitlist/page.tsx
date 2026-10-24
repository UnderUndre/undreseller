'use client';

/**
 * Admin waitlist outcomes (T072, US5, FR-422): minimal outcome counters —
 * offers by status, entries by status, recovered slots.
 */

import React, { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';

interface WaitlistStats {
  offers: Record<string, number>;
  entries: Record<string, number>;
  recoveredSlots: number;
  offersSent: number;
}

const OFFER_STATUSES = ['SENT', 'CLAIMED', 'TAKEN', 'EXPIRED'] as const;
const ENTRY_STATUSES = ['ACTIVE', 'NOTIFIED', 'FULFILLED', 'EXPIRED', 'CANCELLED'] as const;

export default function AdminWaitlistPage() {
  // T040 (FR-411): admin chrome i18n.
  const t = useTranslations('admin.waitlist');
  const [stats, setStats] = useState<WaitlistStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/waitlist/stats');
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || t('loadFailed'));
        }
        setStats(await res.json());
      } catch (err: unknown) {
        setErrorMsg(err instanceof Error ? err.message : t('loadError'));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 pb-24 space-y-6">
      <h1 className="text-xl font-bold text-base-content">{t('title')}</h1>

      {loading && <p className="text-sm text-base-content/60">{t('loading')}</p>}
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
              <p className="text-xs text-base-content/60">{t('slotsRecovered')}</p>
            </div>
            <div className="bg-base-200 border border-base-300 rounded-xl p-4">
              <p className="text-2xl font-extrabold text-base-content">{stats.offersSent}</p>
              <p className="text-xs text-base-content/60">{t('offersSent')}</p>
            </div>
          </div>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-base-content/80">{t('offersByStatus')}</h2>
            <div className="bg-base-200 border border-base-300 rounded-xl divide-y divide-base-300">
              {OFFER_STATUSES.map((status) => (
                <div key={status} className="flex justify-between px-4 py-2.5 text-sm">
                  <span className="text-base-content/60">{t(`offer${status}`)}</span>
                  <span className="font-semibold">{stats.offers[status] ?? 0}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-base-content/80">{t('entriesByStatus')}</h2>
            <div className="bg-base-200 border border-base-300 rounded-xl divide-y divide-base-300">
              {ENTRY_STATUSES.map((status) => (
                <div key={status} className="flex justify-between px-4 py-2.5 text-sm">
                  <span className="text-base-content/60">{t(`entry${status}`)}</span>
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
