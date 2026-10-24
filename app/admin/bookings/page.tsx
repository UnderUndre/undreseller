'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';

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
}

export default function AdminBookingsPage() {
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
        if (res.status === 401) throw new Error('Unauthorized: please sign in with staff credentials');
        const data = await res.json();
        throw new Error(data.error || 'Failed to load bookings');
      }
      const data = await res.json();
      setBookings(data.bookings || []);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Error loading bookings');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadBookings();
  }, []);

  async function handleAction(bookingId: string, action: string) {
    if (!confirm(`Are you sure you want to perform '${action}' on this booking?`)) return;

    try {
      const res = await fetch(`/api/admin/bookings/${bookingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Action failed');
      }
      await loadBookings();
    } catch (err: unknown) {
      alert(`Action error: ${err instanceof Error ? err.message : 'Action failed'}`);
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
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6 text-white pb-24">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-gray-800 pb-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Staff Booking Operations</h1>
          <p className="text-xs text-gray-400 pt-1">
            Role-bounded appointment management, outcall coverage review, and fulfillments (FR-326)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/"
            className="text-xs bg-gray-800 hover:bg-gray-700 px-3 py-1.5 rounded-lg transition-colors"
          >
            Public Site
          </Link>
          <button
            onClick={loadBookings}
            className="text-xs bg-purple-600 hover:bg-purple-500 font-medium px-3 py-1.5 rounded-lg transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {['ALL', 'PENDING', 'CONFIRMED', 'OUT_CALL'].map((f) => (
          <button
            key={f}
            onClick={() => setFilterMode(f)}
            className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${
              filterMode === f
                ? 'bg-purple-600 border-purple-400 text-white'
                : 'bg-gray-900 border-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {errorMsg && (
        <div className="p-4 bg-error-surface/40 border border-error/60 rounded-xl text-xs text-error">
          {errorMsg}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-sm text-gray-400 animate-pulse">Loading appointments...</div>
      ) : filteredBookings.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-gray-800 rounded-xl">
          <p className="text-xs text-gray-400">No bookings match the selected filter.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-800 bg-gray-900/40">
          <table className="w-full text-left text-xs divide-y divide-gray-800">
            <thead className="bg-gray-950/80 text-gray-400 uppercase tracking-wider font-semibold">
              <tr>
                <th className="py-3 px-4">Order #</th>
                <th className="py-3 px-4">Service</th>
                <th className="py-3 px-4">Customer</th>
                <th className="py-3 px-4">Mode & Address</th>
                <th className="py-3 px-4">Schedule</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/60">
              {filteredBookings.map((b) => (
                <tr key={b.bookingId} className="hover:bg-gray-800/30 transition-colors">
                  <td className="py-3 px-4 font-mono font-semibold">{b.orderNumber}</td>
                  <td className="py-3 px-4">{b.serviceTitle}</td>
                  <td className="py-3 px-4">
                    <div className="font-medium text-gray-200">{b.customerName}</div>
                    <div className="text-gray-400 font-mono text-[11px]">{b.customerContact}</div>
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
                      <div className="text-gray-400 text-[11px] max-w-xs truncate" title={b.serviceAddress}>
                        📍 {b.serviceAddress}
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-4 font-mono text-[11px]">
                    {new Date(b.startsAt).toLocaleString()}
                  </td>
                  <td className="py-3 px-4">
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
                          Approve
                        </button>
                        <button
                          onClick={() => handleAction(b.bookingId, 'REJECT_COVERAGE')}
                          className="bg-error hover:bg-error text-white px-2 py-1 rounded text-[11px] font-medium"
                        >
                          Reject
                        </button>
                      </>
                    )}
                    {b.status === 'CONFIRMED' && (
                      <button
                        onClick={() => handleAction(b.bookingId, 'COMPLETE')}
                        className="bg-purple-600 hover:bg-purple-500 text-white px-2 py-1 rounded text-[11px] font-medium"
                      >
                        Complete
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
