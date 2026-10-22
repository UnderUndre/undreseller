'use client';

import React, { useState, useEffect } from 'react';
import { useTelegram } from '../tma/TelegramProvider';

export interface BookingServiceInfo {
  id: string;
  title: string;
  description: string;
  durationMin: number;
  inCallEnabled: boolean;
  outCallEnabled: boolean;
  priceMinor: number;
  outCallPriceMinor?: number | null;
  outCallTravelFeeMinor?: number;
  currency: string;
}

export function SlotGrid({
  service,
  currency,
  currencyConfirmed = true,
  performerSlug,
  businessServiceAddress,
  outCallCoverageDescription,
}: {
  service: BookingServiceInfo;
  currency: string;
  currencyConfirmed?: boolean;
  performerSlug?: string;
  businessServiceAddress?: string | null;
  outCallCoverageDescription?: string | null;
}) {
  const { isTma, user, hapticFeedback } = useTelegram();

  // Mode selection: default to IN_CALL if enabled, else OUT_CALL
  const [mode, setMode] = useState<'IN_CALL' | 'OUT_CALL'>(
    service.inCallEnabled ? 'IN_CALL' : 'OUT_CALL'
  );

  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });

  const [slots, setSlots] = useState<any[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<any | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Customer form details
  const [customerName, setCustomerName] = useState(user?.first_name || '');
  const [customerContact, setCustomerContact] = useState(user?.username ? `@${user.username}` : '');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerNote, setCustomerNote] = useState('');

  // Booking success state
  const [bookingSuccess, setBookingSuccess] = useState<any | null>(null);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelStatus, setCancelStatus] = useState<string | null>(null);

  // Price calculations
  const isOutCall = mode === 'OUT_CALL';
  const servicePriceMinor = isOutCall && service.outCallPriceMinor != null ? service.outCallPriceMinor : service.priceMinor;
  const travelFeeMinor = isOutCall ? (service.outCallTravelFeeMinor || 0) : 0;
  const totalMinor = servicePriceMinor + travelFeeMinor;

  const formatPrice = (minor: number) => {
    return `${(minor / 100).toFixed(2)} ${currency}`;
  };

  // Fetch slots on date, mode, or service change
  useEffect(() => {
    let active = true;
    async function fetchSlots() {
      setLoadingSlots(true);
      setErrorMsg(null);
      setSelectedSlot(null);
      try {
        const query = new URLSearchParams({
          serviceId: service.id,
          date: selectedDate,
          mode,
          ...(performerSlug ? { professionalId: performerSlug } : {}),
        });
        const res = await fetch(`/api/booking/slots?${query.toString()}`);
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to fetch slots');
        }
        const data = await res.json();
        if (active) {
          setSlots(data.slots || []);
        }
      } catch (err: any) {
        if (active) {
          setErrorMsg(err.message || 'Error fetching slots');
        }
      } finally {
        if (active) setLoadingSlots(false);
      }
    }

    fetchSlots();
    return () => {
      active = false;
    };
  }, [service.id, selectedDate, mode, performerSlug]);

  const handleBookingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSlot) {
      setErrorMsg('Please select an appointment time slot');
      return;
    }
    if (!customerName.trim()) {
      setErrorMsg('Please provide your name');
      return;
    }
    if (!customerContact.trim()) {
      setErrorMsg('Please provide your phone or email');
      return;
    }
    if (isOutCall && customerAddress.trim().length < 5) {
      setErrorMsg('Please provide your complete address for outcall visit');
      return;
    }

    setBookingLoading(true);
    setErrorMsg(null);

    try {
      if (hapticFeedback) hapticFeedback('impact', 'medium');

      const payload = {
        serviceId: service.id,
        professionalId: performerSlug,
        fulfillmentMode: mode,
        serviceAddress: isOutCall ? customerAddress.trim() : undefined,
        startsAt: selectedSlot.startsAt,
        customerName: customerName.trim(),
        customerContact: customerContact.trim(),
        customerNote: customerNote.trim() || undefined,
        idempotencyKey: `book_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      };

      const res = await fetch('/api/booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to complete booking');
      }

      setBookingSuccess(data.booking);
    } catch (err: any) {
      setErrorMsg(err.message || 'Booking submission failed');
    } finally {
      setBookingLoading(false);
    }
  };

  const handleCancellation = async () => {
    if (!bookingSuccess?.cancellationToken || !bookingSuccess?.bookingId) return;
    if (!confirm('Are you sure you want to cancel this appointment?')) return;

    setCancelLoading(true);
    try {
      const res = await fetch(`/api/booking/${bookingSuccess.bookingId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: bookingSuccess.cancellationToken }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to cancel');
      setCancelStatus('Your appointment has been successfully cancelled.');
    } catch (err: any) {
      alert(`Error cancelling appointment: ${err.message}`);
    } finally {
      setCancelLoading(false);
    }
  };

  // Success Confirmation Screen
  if (bookingSuccess) {
    return (
      <div className="bg-gray-900/80 border border-gray-800 rounded-2xl p-6 sm:p-8 space-y-6 text-white max-w-xl mx-auto backdrop-blur-sm">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto text-3xl font-bold border border-emerald-500/40">
            ✓
          </div>
          <h2 className="text-2xl font-extrabold tracking-tight">
            {bookingSuccess.status === 'CONFIRMED' ? 'Appointment Confirmed!' : 'Request Received (Pending Review)'}
          </h2>
          <p className="text-sm text-gray-400">Order #{bookingSuccess.orderNumber}</p>
        </div>

        <div className="bg-gray-800/60 rounded-xl p-4 space-y-3 text-sm divide-y divide-gray-700/60">
          <div className="flex justify-between pt-1">
            <span className="text-gray-400">Service:</span>
            <span className="font-semibold">{bookingSuccess.serviceTitle}</span>
          </div>
          <div className="flex justify-between pt-3">
            <span className="text-gray-400">Appointment Time:</span>
            <span className="font-semibold font-mono">
              {new Date(bookingSuccess.startsAt).toLocaleString()}
            </span>
          </div>
          <div className="flex justify-between pt-3">
            <span className="text-gray-400">Fulfillment Mode:</span>
            <span className="font-semibold">
              {bookingSuccess.fulfillmentMode === 'IN_CALL' ? 'In-Studio Visit' : 'Professional Outcall'}
            </span>
          </div>

          {/* Reveal private business address for confirmed in-call */}
          {bookingSuccess.fulfillmentMode === 'IN_CALL' && bookingSuccess.serviceAddress && (
            <div className="pt-3">
              <span className="text-gray-400 block text-xs">Studio Location:</span>
              <span className="font-semibold text-emerald-400 block pt-0.5">
                📍 {bookingSuccess.serviceAddress}
              </span>
            </div>
          )}

          {/* Outcall customer address snapshot */}
          {bookingSuccess.fulfillmentMode === 'OUT_CALL' && (
            <div className="pt-3">
              <span className="text-gray-400 block text-xs">Outcall Destination:</span>
              <span className="font-semibold text-purple-300 block pt-0.5">
                🏠 {bookingSuccess.serviceAddress}
              </span>
              <p className="text-xs text-gray-400 pt-1">
                Our staff will review your address and confirm appointment coverage shortly.
              </p>
            </div>
          )}

          <div className="flex justify-between pt-3">
            <span className="text-gray-400">Total Price:</span>
            <span className="font-extrabold text-base text-emerald-400">
              {formatPrice(bookingSuccess.totalMinor)}
            </span>
          </div>
        </div>

        {/* Cancellation Section */}
        <div className="border-t border-gray-800 pt-4 space-y-2 text-center">
          {cancelStatus ? (
            <p className="text-sm text-amber-400 font-medium">{cancelStatus}</p>
          ) : (
            <>
              <p className="text-xs text-gray-400">Need to reschedule or cancel your visit?</p>
              <button
                type="button"
                onClick={handleCancellation}
                disabled={cancelLoading}
                className="text-xs text-rose-400 hover:text-rose-300 underline font-medium transition-colors"
              >
                {cancelLoading ? 'Cancelling...' : 'Cancel Appointment'}
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-6 sm:p-8 space-y-8 text-white max-w-2xl mx-auto backdrop-blur-sm">
      {/* Service Header & Location Mode Switch */}
      <div className="space-y-4">
        <div className="flex justify-between items-start gap-3">
          <div>
            <h1 className="text-2xl font-bold">{service.title}</h1>
            <p className="text-xs text-gray-400 pt-1">{service.durationMin} minutes</p>
          </div>
          <div className="text-right">
            <span className="text-2xl font-extrabold text-emerald-400">
              {formatPrice(totalMinor)}
            </span>
            {isOutCall && travelFeeMinor > 0 && (
              <p className="text-xs text-gray-400">Includes {formatPrice(travelFeeMinor)} travel fee</p>
            )}
          </div>
        </div>

        {/* Location mode selector */}
        {service.inCallEnabled && service.outCallEnabled && (
          <div className="flex rounded-xl bg-gray-950 p-1 border border-gray-800">
            <button
              type="button"
              onClick={() => setMode('IN_CALL')}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
                mode === 'IN_CALL'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              In-Studio Visit
            </button>
            <button
              type="button"
              onClick={() => setMode('OUT_CALL')}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
                mode === 'OUT_CALL'
                  ? 'bg-purple-600 text-white shadow'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Professional Outcall
            </button>
          </div>
        )}

        {isOutCall && outCallCoverageDescription && (
          <p className="text-xs text-purple-300 bg-purple-950/40 border border-purple-800/40 rounded-lg p-2.5">
            ℹ️ Coverage Note: {outCallCoverageDescription}
          </p>
        )}
      </div>

      <form onSubmit={handleBookingSubmit} className="space-y-6">
        {/* Date Selection */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400">
            Select Date
          </label>
          <input
            type="date"
            value={selectedDate}
            min={new Date().toISOString().split('T')[0]}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 font-mono"
          />
        </div>

        {/* Slots Grid */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400">
              Available Time Slots
            </label>
            {loadingSlots && <span className="text-xs text-blue-400 animate-pulse">Checking slots...</span>}
          </div>

          {slots.length === 0 && !loadingSlots ? (
            <div className="text-center py-8 border border-dashed border-gray-800 rounded-xl">
              <p className="text-xs text-gray-400">No slots available for this date. Try another date.</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5 max-h-56 overflow-y-auto pr-1">
              {slots.map((s, idx) => {
                const timeLabel = new Date(s.startsAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                });
                const isSelected = selectedSlot?.startsAt === s.startsAt;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSelectedSlot(s)}
                    className={`py-2 px-3 text-xs font-mono font-medium rounded-lg border transition-all text-center ${
                      isSelected
                        ? 'bg-blue-600 border-blue-400 text-white shadow-sm'
                        : 'bg-gray-950 border-gray-800 text-gray-300 hover:border-gray-700'
                    }`}
                  >
                    {timeLabel}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Customer Information Inputs */}
        <div className="space-y-4 pt-2 border-t border-gray-800">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-gray-400">Your Full Name *</label>
              <input
                type="text"
                required
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Jane Doe"
                className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-gray-400">Phone or Email *</label>
              <input
                type="text"
                required
                value={customerContact}
                onChange={(e) => setCustomerContact(e.target.value)}
                placeholder="+374 99 123456 or name@example.com"
                className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* Outcall Address input */}
          {isOutCall && (
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-purple-300">
                Outcall Service Address *
              </label>
              <input
                type="text"
                required
                value={customerAddress}
                onChange={(e) => setCustomerAddress(e.target.value)}
                placeholder="Street address, apartment/suite number, city"
                className="w-full bg-gray-950 border border-purple-800/60 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-purple-500"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-gray-400">Appointment Notes (optional)</label>
            <textarea
              rows={2}
              value={customerNote}
              onChange={(e) => setCustomerNote(e.target.value)}
              placeholder="Any special requests or details..."
              className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        {errorMsg && (
          <div className="p-3 bg-rose-950/40 border border-rose-800/60 rounded-xl text-xs text-rose-300">
            {errorMsg}
          </div>
        )}

        <button
          type="submit"
          disabled={bookingLoading || !selectedSlot}
          className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 disabled:text-gray-500 text-white font-bold py-3 px-4 rounded-xl text-sm transition-all shadow-md"
        >
          {bookingLoading ? 'Securing Slot...' : `Confirm Booking • ${formatPrice(totalMinor)}`}
        </button>
      </form>
    </div>
  );
}
