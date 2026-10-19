'use client';

import React, { useState, useEffect } from 'react';
import { useTelegram } from '../tma/TelegramProvider';

interface AvailableSlot {
  startTime: string;
  endTime: string;
}

interface HoldSuccessData {
  order: {
    id: string;
    orderNumber: string;
    status: string;
  };
  reservation: {
    id: string;
    holdExpiresAt: string;
  };
}

export function SlotGrid({ itemId, itemTitle }: { itemId: string; itemTitle: string }) {
  const { isTma, initDataRaw, user, hapticFeedback } = useTelegram();

  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });

  const [slots, setSlots] = useState<AvailableSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null);

  // Form states
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');

  // Lock status
  const [locking, setLocking] = useState(false);
  const [conflictError, setConflictError] = useState<string | null>(null);
  const [holdSuccess, setHoldSuccess] = useState<HoldSuccessData | null>(null);

  useEffect(() => {
    if (user?.first_name) {
      setCustomerName([user.first_name, user.last_name].filter(Boolean).join(' '));
    }
  }, [user]);

  useEffect(() => {
    async function fetchSlots() {
      setLoadingSlots(true);
      setConflictError(null);
      setSelectedSlot(null);
      try {
        const res = await fetch(`/api/booking/slots?itemId=${encodeURIComponent(itemId)}&date=${selectedDate}`);
        if (res.ok) {
          const data = await res.json();
          setSlots(data.slots || []);
        } else {
          setSlots([]);
        }
      } catch (err) {
        console.error('Failed to load slots', err);
        setSlots([]);
      } finally {
        setLoadingSlots(false);
      }
    }
    fetchSlots();
  }, [itemId, selectedDate]);

  async function handleLockSlot(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSlot) return;

    setLocking(true);
    setConflictError(null);

    const payload: Record<string, unknown> = {
      itemId,
      startTime: selectedSlot.startTime,
    };

    if (isTma && initDataRaw) {
      payload.initData = initDataRaw;
    } else {
      payload.customerName = customerName;
      payload.customerPhone = customerPhone;
      payload.customerEmail = customerEmail || null;
    }

    try {
      const res = await fetch('/api/booking/lock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.status === 409) {
        hapticFeedback.notificationOccurred('error');
        setConflictError('Selected slot has just been taken by another customer. Please choose another window.');
        setSelectedSlot(null);
        const reload = await fetch(`/api/booking/slots?itemId=${encodeURIComponent(itemId)}&date=${selectedDate}`);
        if (reload.ok) {
          const data = await reload.json();
          setSlots(data.slots || []);
        }
        return;
      }

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to lock slot');
      }

      const data = await res.json();
      hapticFeedback.notificationOccurred('success');
      setHoldSuccess(data as HoldSuccessData);
    } catch (err: unknown) {
      setConflictError(String(err));
    } finally {
      setLocking(false);
    }
  }

  if (holdSuccess) {
    return (
      <div className="bg-emerald-950/60 border border-emerald-500/50 rounded-xl p-6 text-center">
        <h3 className="text-2xl font-bold text-emerald-400 mb-2">Slot Reserved (Held)!</h3>
        <p className="text-gray-300 mb-4">
          Order <strong>{holdSuccess.order.orderNumber}</strong> for <em>{itemTitle}</em> has been created.
          Your reservation is held for 15 minutes.
        </p>
        <p className="text-xs text-gray-400 font-mono mb-6">
          Expires at: {new Date(holdSuccess.reservation.holdExpiresAt).toLocaleTimeString()}
        </p>
        <a
          href={`/checkout?orderId=${holdSuccess.order.id}`}
          className="inline-block bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 px-6 rounded-lg shadow-lg transition"
        >
          Proceed to Payment →
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {conflictError && (
        <div className="p-4 bg-rose-950/80 border border-rose-500 rounded-lg text-rose-200 text-sm">
          ⚠️ {conflictError}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">Select Date for {itemTitle}:</label>
        <input
          type="date"
          value={selectedDate}
          min={new Date().toISOString().split('T')[0]}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="bg-gray-900 border border-gray-700 text-white px-4 py-2.5 rounded-lg w-full max-w-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">Available Time Windows:</label>
        {loadingSlots ? (
          <p className="text-sm text-gray-400">Loading available windows...</p>
        ) : slots.length === 0 ? (
          <p className="text-sm text-amber-400">No available slots for this date. Try another day.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {slots.map((s, idx) => {
              const startFormatted = new Date(s.startTime).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              });
              const isSelected = selectedSlot?.startTime === s.startTime;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setSelectedSlot(s);
                    hapticFeedback.impactOccurred('light');
                  }}
                  className={`py-2 px-3 rounded-lg border text-sm font-mono transition ${
                    isSelected
                      ? 'bg-blue-600 border-blue-400 text-white font-bold shadow-md'
                      : 'bg-gray-900 border-gray-800 text-gray-300 hover:border-gray-600'
                  }`}
                >
                  {startFormatted}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {selectedSlot && (
        <form onSubmit={handleLockSlot} className="border-t border-gray-800 pt-6 space-y-4">
          <h4 className="text-lg font-semibold text-white">Your Contact Details:</h4>

          {!isTma && (
            <>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="bg-gray-900 border border-gray-700 text-white px-3 py-2 rounded-lg w-full text-sm"
                  placeholder="John Doe"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Phone Number *</label>
                <input
                  type="tel"
                  required
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  className="bg-gray-900 border border-gray-700 text-white px-3 py-2 rounded-lg w-full text-sm"
                  placeholder="+1 555 019 2834"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Email (Optional)</label>
                <input
                  type="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  className="bg-gray-900 border border-gray-700 text-white px-3 py-2 rounded-lg w-full text-sm"
                  placeholder="john@example.com"
                />
              </div>
            </>
          )}

          {isTma && (
            <p className="text-xs text-emerald-400">
              ✓ Booking via Telegram Mini App as @{user?.username || user?.first_name || 'Telegram User'}
            </p>
          )}

          <button
            type="submit"
            disabled={locking}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold py-3 px-4 rounded-lg shadow-lg transition"
          >
            {locking ? 'Holding Slot...' : `Hold Slot (${new Date(selectedSlot.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}) for 15 Min`}
          </button>
        </form>
      )}
    </div>
  );
}
