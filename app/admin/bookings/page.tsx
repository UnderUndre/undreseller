'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

// T040: filter tab -> message key suffix (admin.bookings.filter*).
const FILTER_LABELS = { ALL: 'All', PENDING: 'Pending', CONFIRMED: 'Confirmed', OUT_CALL: 'OutCall' } as const;

interface AdminBookingRow {
  bookingId: string;
  orderNumber: string;
  serviceTitle: string;
  customerName: string;
  customerContact: string;
  serviceAddress?: string | null;
  startsAt: string;
  status: string;
  fulfillmentMode?: string | null;
  fieldAnswers?: { label: string; type: string; value: string }[];
}

export default function AdminBookingsPage() {
  // T040 (FR-411): admin chrome i18n; booking rows carry authored/business data.
  const t = useTranslations('admin.bookings');
  const tCommon = useTranslations('admin.common');
  const [bookings, setBookings] = useState<AdminBookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<string>('ALL');

  async function loadBookings() {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/admin/bookings');
      if (!res.ok) {
        if (res.status === 401) throw new Error(tCommon('errorGeneric'));
        const data = await res.json();
        throw new Error(data.error || t('actionFailed'));
      }
      const data = await res.json();
      setBookings(data.bookings || []);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : t('actionFailed'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadBookings();
  }, []);

  async function handleAction(bookingId: string, action: string) {
    if (!confirm(t('actionConfirm', { action }))) return;

    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || t('actionFailed'));
      }
      await loadBookings();
    } catch (err: unknown) {
      alert(t('actionError', { error: err instanceof Error ? err.message : t('actionFailed') }));
    }
  }

  const filteredBookings = bookings.filter((b) => {
    if (filterMode === 'ALL') return true;
    if (filterMode === 'OUT_CALL') return b.fulfillmentMode === 'OUT_CALL';
    if (filterMode === 'PENDING') return b.status === 'PENDING';
    if (filterMode === 'CONFIRMED') return b.status === 'CONFIRMED';
    return true;
  });

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6 text-base-content pb-24">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-base-300 pb-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">{t('title')}</h1>
          <p className="text-xs text-base-content/60 pt-1">
            {t('subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/"
            className="text-xs bg-base-300 hover:bg-base-300 px-3 py-1.5 rounded-lg transition-colors"
          >
            {tCommon('publicSite')}
          </Link>
          <button
            onClick={loadBookings}
            className="text-xs bg-purple-600 hover:bg-purple-500 font-medium px-3 py-1.5 rounded-lg transition-colors"
          >
            {tCommon('refresh')}
          </button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {(['ALL', 'PENDING', 'CONFIRMED', 'OUT_CALL'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilterMode(f)}
            className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${
              filterMode === f
                ? 'bg-purple-600 border-purple-400 text-white'
                : 'bg-base-200 border-base-300 text-base-content/60 hover:text-base-content'
            }`}
          >
            {t(`filter${FILTER_LABELS[f]}`)}
          </button>
        ))}
      </div>

      {errorMsg && (
        <div className="p-4 bg-error-surface/40 border border-error/60 rounded-xl text-xs text-error">
          {errorMsg}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-sm text-base-content/60 animate-pulse">{t('loading')}</div>
      ) : filteredBookings.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-base-300 rounded-xl">
          <p className="text-xs text-base-content/60">{t('noBookings')}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-base-300 bg-base-200/40">
          <table className="w-full text-left text-xs divide-y divide-base-300">
            <thead className="bg-base-100/80 text-base-content/60 uppercase tracking-wider font-semibold">
              <tr>
                <th className="py-3 px-4">{t('colOrder')}</th>
                <th className="py-3 px-4">{t('colService')}</th>
                <th className="py-3 px-4">{t('colCustomer')}</th>
                <th className="py-3 px-4">{t('colMode')}</th>
                <th className="py-3 px-4">{t('colSchedule')}</th>
                <th className="py-3 px-4">{t('colStatus')}</th>
                <th className="py-3 px-4 text-right">{t('colActions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-base-300/60">
              {filteredBookings.map((b) => (
                <tr key={b.bookingId} className="hover:bg-base-300/30 transition-colors">
                  <td className="py-3 px-4 font-mono font-semibold">{b.orderNumber}</td>
                  <td className="py-3 px-4">{b.serviceTitle}</td>
                  <td className="py-3 px-4">
                    <div className="font-medium text-base-content/90">{b.customerName}</div>
                    <div className="text-base-content/60 font-mono text-[11px]">{b.customerContact}</div>
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold mb-1 ${
                        b.fulfillmentMode === 'IN_CALL'
                          ? 'bg-green-900/80 text-green-300 border border-green-800/60'
                          : 'bg-purple-900/80 text-purple-300 border border-purple-800/60'
                      }`}
                    >
                      {b.fulfillmentMode || 'IN_CALL'}
                    </span>
                    {b.serviceAddress && (
                      <div className="text-base-content/60 text-[11px] max-w-xs truncate" title={b.serviceAddress}>
                        📍 {b.serviceAddress}
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-4 font-mono text-[11px]">
                    {new Date(b.startsAt).toLocaleString()}
                  </td>
                  <td className="py-3 px-4">
                    {b.fieldAnswers && b.fieldAnswers.length > 0 && (
                      <div className="space-y-0.5 mb-1">
                        {b.fieldAnswers.map((a, i) => (
                          <div key={i} className="text-[11px] text-base-content/80">
                            <span className="text-base-content/50">{a.label}:</span> {a.value}
                          </div>
                        ))}
                      </div>
                    )}
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${
                        b.status === 'CONFIRMED'
                          ? 'bg-purple-900 text-purple-300 border border-purple-800'
                          : b.status === 'PENDING'
                          ? 'bg-warning-surface text-warning border border-warning'
                          : b.status === 'COMPLETED'
                          ? 'bg-green-900 text-green-300 border border-green-800'
                          : 'bg-error-surface text-error border border-error'
                      }`}
                    >
                      {b.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right space-x-1.5 whitespace-nowrap">
                    {b.status === 'PENDING' && b.fulfillmentMode === 'OUT_CALL' && (
                      <>
                        <button
                          onClick={() => handleAction(b.bookingId, 'APPROVE_COVERAGE')}
                          className="bg-green-600 hover:bg-green-500 text-white px-2 py-1 rounded text-[11px] font-medium"
                        >
                          {t('approve')}
                        </button>
                        <button
                          onClick={() => handleAction(b.bookingId, 'REJECT_COVERAGE')}
                          className="bg-error hover:bg-error text-base-content px-2 py-1 rounded text-[11px] font-medium"
                        >
                          {t('reject')}
                        </button>
                      </>
                    )}
                    {b.status === 'CONFIRMED' && (
                      <button
                        onClick={() => handleAction(b.bookingId, 'COMPLETE')}
                        className="bg-purple-600 hover:bg-purple-500 text-white px-2 py-1 rounded text-[11px] font-medium"
                      >
                        {t('complete')}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
