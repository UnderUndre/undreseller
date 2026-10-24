'use client';

import React, { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useTelegram } from '../tma/TelegramProvider';
import type { AvailableSlot, UnavailableSlot } from '@/lib/booking/windows';
import CustomFieldsBlock, {
  BookingCustomField,
  CustomAnswers,
} from './CustomFieldsBlock';

interface BookingSuccessState {
  bookingId: string;
  cancellationToken: string;
  status: string;
  orderNumber: string;
  serviceTitle: string;
  startsAt: string;
  fulfillmentMode: string;
  serviceAddress?: string | null;
  totalMinor?: number;
}

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
  performerSlug,
  outCallCoverageDescription,
  customFields,
}: {
  service: BookingServiceInfo;
  currency: string;
  currencyConfirmed?: boolean;
  performerSlug?: string;
  businessServiceAddress?: string | null;
  outCallCoverageDescription?: string | null;
  /** US6 (FR-423): active custom booking fields bound to this service. */
  customFields?: BookingCustomField[];
}) {
  const { user, hapticFeedback, initDataRaw } = useTelegram();
  // T040 (FR-411): booking form chrome; service.title stays authored (FR-414).
  const t = useTranslations('web.booking');

  // Mode selection: default to IN_CALL if enabled, else OUT_CALL
  const [mode, setMode] = useState<'IN_CALL' | 'OUT_CALL'>(
    service.inCallEnabled ? 'IN_CALL' : 'OUT_CALL'
  );

  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });

  const [slots, setSlots] = useState<AvailableSlot[]>([]);
  const [unavailable, setUnavailable] = useState<UnavailableSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Customer form details
  const [customerName, setCustomerName] = useState(user?.first_name || '');
  const [customerContact, setCustomerContact] = useState(user?.username ? `@${user.username}` : '');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerNote, setCustomerNote] = useState('');
  // US6 custom field answers (keyed by field.key)
  const [customAnswers, setCustomAnswers] = useState<CustomAnswers>({});

  // Booking success state
  const [bookingSuccess, setBookingSuccess] = useState<BookingSuccessState | null>(null);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelStatus, setCancelStatus] = useState<string | null>(null);

  // T072: waitlist join from empty grid
  const [joining, setJoining] = useState(false);
  const [waitlistStatus, setWaitlistStatus] = useState<{ ok: boolean; msg: string } | null>(null);

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
          includeUnavailable: '1',
          ...(performerSlug ? { professionalId: performerSlug } : {}),
        });
        const res = await fetch(`/api/booking/slots?${query.toString()}`);
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || t('fetchFailed'));
        }
        const data = await res.json();
        if (active) {
          setSlots(data.slots || []);
          setUnavailable(data.unavailable || []);
        }
      } catch (err: unknown) {
        if (active) {
          setErrorMsg(err instanceof Error ? err.message : t('fetchError'));
        }
      } finally {
        if (active) setLoadingSlots(false);
      }
    }

    fetchSlots();
    return () => {
      active = false;
    };
  }, [service.id, selectedDate, mode, performerSlug, t]);

  const handleBookingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSlot) {
      setErrorMsg(t('selectSlot'));
      return;
    }
    if (!customerName.trim()) {
      setErrorMsg(t('provideName'));
      return;
    }
    if (!customerContact.trim()) {
      setErrorMsg(t('provideContact'));
      return;
    }
    if (isOutCall && customerAddress.trim().length < 5) {
      setErrorMsg(t('provideAddress'));
      return;
    }

    setBookingLoading(true);
    setErrorMsg(null);

    try {
      if (hapticFeedback) hapticFeedback.impactOccurred('medium');

      const payload = {
        serviceId: service.id,
        professionalId: performerSlug,
        fulfillmentMode: mode,
        serviceAddress: isOutCall ? customerAddress.trim() : undefined,
        startsAt: selectedSlot.startsAt,
        customerName: customerName.trim(),
        customerContact: customerContact.trim(),
        customerNote: customerNote.trim() || undefined,
        fieldAnswers: Object.keys(customAnswers).length > 0 ? customAnswers : undefined,
        idempotencyKey: `book_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      };

      const res = await fetch('/api/booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || t('submitFailed'));
      }

      setBookingSuccess(data.booking);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : t('submitError'));
    } finally {
      setBookingLoading(false);
    }
  };

  const handleCancellation = async () => {
    if (!bookingSuccess?.cancellationToken || !bookingSuccess?.bookingId) return;
    if (!confirm(t('cancelConfirm'))) return;

    setCancelLoading(true);
    try {
      const res = await fetch(`/api/booking/${bookingSuccess.bookingId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: bookingSuccess.cancellationToken }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t('cancelFailed'));
      setCancelStatus(t('cancelSuccess'));
    } catch (err: unknown) {
      alert(t('cancelError', { error: err instanceof Error ? err.message : 'unknown error' }));
    } finally {
      setCancelLoading(false);
    }
  };

  const handleJoinWaitlist = async () => {
    setJoining(true);
    setWaitlistStatus(null);
    try {
      if (hapticFeedback) hapticFeedback.impactOccurred('light');
      if (!initDataRaw) {
        throw new Error(t('waitlistTmaOnly'));
      }
      const res = await fetch('/api/waitlist/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceId: service.id,
          windowStartAt: new Date(`${selectedDate}T00:00:00`).toISOString(),
          windowEndAt: new Date(`${selectedDate}T23:59:59`).toISOString(),
          contact: customerContact.trim() || undefined,
          initData: initDataRaw,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || t('fetchFailed'));
      }
      if (hapticFeedback) hapticFeedback.notificationOccurred('success');
      setWaitlistStatus({ ok: true, msg: t('waitlistJoined') });
    } catch (err: unknown) {
      if (hapticFeedback) hapticFeedback.notificationOccurred('error');
      setWaitlistStatus({
        ok: false,
        msg: err instanceof Error ? err.message : t('fetchFailed'),
      });
    } finally {
      setJoining(false);
    }
  };

  // Success Confirmation Screen
  if (bookingSuccess) {
    return (
      <div className="bg-base-200/80 border border-base-300 rounded-2xl p-6 sm:p-8 space-y-6 text-base-content max-w-xl mx-auto backdrop-blur-sm">
        <div className="text-center space-y-2">
          <div className="w-16 h-16 bg-green-500/20 text-green-400 rounded-full flex items-center justify-center mx-auto text-3xl font-bold border border-green-500/40">
            ✓
          </div>
          <h2 className="text-2xl font-extrabold tracking-tight">
            {bookingSuccess.status === 'CONFIRMED' ? t('successTitle') : t('pendingTitle')}
          </h2>
          <p className="text-sm text-base-content/60">{t('orderLabel', { orderNumber: bookingSuccess.orderNumber })}</p>
        </div>

        <div className="bg-base-300/60 rounded-xl p-4 space-y-3 text-sm divide-y divide-base-300/60">
          <div className="flex justify-between pt-1">
            <span className="text-base-content/60">{t('serviceLabel')}</span>
            <span className="font-semibold">{bookingSuccess.serviceTitle}</span>
          </div>
          <div className="flex justify-between pt-3">
            <span className="text-base-content/60">{t('timeLabel')}</span>
            <span className="font-semibold font-mono">
              {new Date(bookingSuccess.startsAt).toLocaleString()}
            </span>
          </div>
          <div className="flex justify-between pt-3">
            <span className="text-base-content/60">{t('modeLabel')}</span>
            <span className="font-semibold">
              {bookingSuccess.fulfillmentMode === 'IN_CALL' ? t('inCall') : t('outCall')}
            </span>
          </div>

          {/* Reveal private business address for confirmed in-call */}
          {bookingSuccess.fulfillmentMode === 'IN_CALL' && bookingSuccess.serviceAddress && (
            <div className="pt-3">
              <span className="text-base-content/60 block text-xs">{t('studioLocation')}</span>
              <span className="font-semibold text-green-400 block pt-0.5">
                📍 {bookingSuccess.serviceAddress}
              </span>
            </div>
          )}

          {/* Outcall customer address snapshot */}
          {bookingSuccess.fulfillmentMode === 'OUT_CALL' && (
            <div className="pt-3">
              <span className="text-base-content/60 block text-xs">{t('outcallDestination')}</span>
              <span className="font-semibold text-purple-300 block pt-0.5">
                🏠 {bookingSuccess.serviceAddress}
              </span>
              <p className="text-xs text-base-content/60 pt-1">
                {t('outcallReviewNote')}
              </p>
            </div>
          )}

          <div className="flex justify-between pt-3">
            <span className="text-base-content/60">{t('totalLabel')}</span>
            <span className="font-extrabold text-base text-green-400">
              {formatPrice(bookingSuccess.totalMinor ?? 0)}
            </span>
          </div>
        </div>

        {/* Cancellation Section */}
        <div className="border-t border-base-300 pt-4 space-y-2 text-center">
          {cancelStatus ? (
            <p className="text-sm text-warning font-medium">{cancelStatus}</p>
          ) : (
            <>
              <p className="text-xs text-base-content/60">{t('reschedulePrompt')}</p>
              <button
                type="button"
                onClick={handleCancellation}
                disabled={cancelLoading}
                className="text-xs text-error hover:text-error underline font-medium transition-colors"
              >
                {cancelLoading ? t('cancelling') : t('cancelButton')}
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-base-200/60 border border-base-300 rounded-2xl p-6 sm:p-8 space-y-8 text-base-content max-w-2xl mx-auto backdrop-blur-sm">
      {/* Service Header & Location Mode Switch */}
      <div className="space-y-4">
        <div className="flex justify-between items-start gap-3">
          <div>
            <h1 className="text-2xl font-bold">{service.title}</h1>
            <p className="text-xs text-base-content/60 pt-1">{t('minutes', { minutes: service.durationMin })}</p>
          </div>
          <div className="text-right">
            <span className="text-2xl font-extrabold text-green-400">
              {formatPrice(totalMinor)}
            </span>
            {isOutCall && travelFeeMinor > 0 && (
              <p className="text-xs text-base-content/60">{t('includesTravelFee', { price: formatPrice(travelFeeMinor) })}</p>
            )}
          </div>
        </div>

        {/* Location mode selector */}
        {service.inCallEnabled && service.outCallEnabled && (
          <div className="flex rounded-xl bg-base-100 p-1 border border-base-300">
            <button
              type="button"
              onClick={() => setMode('IN_CALL')}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
                mode === 'IN_CALL'
                  ? 'bg-purple-600 text-white shadow'
                  : 'text-base-content/60 hover:text-base-content'
              }`}
            >
              {t('inCall')}
            </button>
            <button
              type="button"
              onClick={() => setMode('OUT_CALL')}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
                mode === 'OUT_CALL'
                  ? 'bg-purple-600 text-white shadow'
                  : 'text-base-content/60 hover:text-base-content'
              }`}
            >
              {t('outCall')}
            </button>
          </div>
        )}

        {isOutCall && outCallCoverageDescription && (
          <p className="text-xs text-purple-300 bg-purple-900/40 border border-purple-800/40 rounded-lg p-2.5">
            {t('coverageNote', { note: outCallCoverageDescription })}
          </p>
        )}
      </div>

      <form onSubmit={handleBookingSubmit} className="space-y-6">
        {/* Date Selection */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold uppercase tracking-wider text-base-content/60">
            {t('selectDate')}
          </label>
          <input
            type="date"
            value={selectedDate}
            min={new Date().toISOString().split('T')[0]}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-full bg-base-100 border border-base-300 rounded-xl px-4 py-2.5 text-sm text-base-content focus:outline-none focus:border-purple-500 font-mono"
          />
          {/* T033: locale word-month label (Intl, no hand-rolled month names) */}
          <p className="text-xs text-base-content/50" aria-live="polite">
            {new Intl.DateTimeFormat(undefined, {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            }).format(new Date(`${selectedDate}T12:00:00`))}
          </p>
        </div>

        {/* Slots Grid */}
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <label className="block text-xs font-semibold uppercase tracking-wider text-base-content/60">
              {t('availableSlots')}
            </label>
            {loadingSlots && <span className="text-xs text-purple-400 animate-pulse">{t('checkingSlots')}</span>}
          </div>

          {slots.length === 0 && !loadingSlots ? (
            <div className="text-center py-8 border border-dashed border-base-300 rounded-xl space-y-3">
              <p className="text-xs text-base-content/60">{t('noSlots')}</p>
              {unavailable.length > 0 && (
                <p className="text-[11px] text-base-content/50 mt-2 px-4">
                  {unavailable.some((u) => u.reason === 'booked') && t('bookedNote')}
                  {unavailable.some((u) => u.reason === 'break') && t('breakNote')}
                </p>
              )}
              {/* T072 (FR-419): join waitlist from the grid empty state */}
              {waitlistStatus && (
                <p
                  className={`text-xs px-4 ${waitlistStatus.ok ? 'text-success' : 'text-error'}`}
                  role="status"
                >
                  {waitlistStatus.msg}
                </p>
              )}
              <button
                type="button"
                onClick={handleJoinWaitlist}
                disabled={joining}
                className="inline-block bg-purple-600 hover:bg-purple-500 disabled:bg-base-300 disabled:text-base-content/50 text-white font-semibold py-2 px-4 rounded-lg text-xs transition-all"
              >
                {joining ? t('joining') : t('joinWaitlist')}
              </button>
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
                        ? 'bg-purple-600 border-purple-400 text-white shadow-sm'
                        : 'bg-base-100 border-base-300 text-base-content/80 hover:border-base-300'
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
        <div className="space-y-4 pt-2 border-t border-base-300">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-base-content/60">{t('yourName')}</label>
              <input
                type="text"
                required
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Jane Doe"
                className="w-full bg-base-100 border border-base-300 rounded-xl px-3.5 py-2 text-sm text-base-content focus:outline-none focus:border-purple-500"
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-base-content/60">{t('contact')}</label>
              <input
                type="text"
                required
                value={customerContact}
                onChange={(e) => setCustomerContact(e.target.value)}
                placeholder="+374 99 123456 or name@example.com"
                className="w-full bg-base-100 border border-base-300 rounded-xl px-3.5 py-2 text-sm text-base-content focus:outline-none focus:border-purple-500"
              />
            </div>
          </div>

          {/* Outcall Address input */}
          {isOutCall && (
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-purple-300">
                {t('outcallAddress')}
              </label>
              <input
                type="text"
                required
                value={customerAddress}
                onChange={(e) => setCustomerAddress(e.target.value)}
                placeholder="Street address, apartment/suite number, city"
                className="w-full bg-base-100 border border-purple-800/60 rounded-xl px-3.5 py-2 text-sm text-base-content focus:outline-none focus:border-purple-500"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-base-content/60">{t('notes')}</label>
            <textarea
              rows={2}
              value={customerNote}
              onChange={(e) => setCustomerNote(e.target.value)}
              placeholder={t('notesPlaceholder')}
              className="w-full bg-base-100 border border-base-300 rounded-xl px-3.5 py-2 text-sm text-base-content focus:outline-none focus:border-purple-500"
            />
          </div>
        </div>

        {/* US6: custom booking fields bound to this service */}
        {customFields && customFields.length > 0 && (
          <CustomFieldsBlock
            fields={customFields}
            answers={customAnswers}
            onChange={setCustomAnswers}
          />
        )}

        {errorMsg && (
          <div className="p-3 bg-error-surface/40 border border-error/60 rounded-xl text-xs text-error">
            {errorMsg}
          </div>
        )}

        <button
          type="submit"
          disabled={bookingLoading || !selectedSlot}
          className="w-full bg-purple-600 hover:bg-purple-500 disabled:bg-base-300 disabled:text-base-content/50 text-white font-bold py-3 px-4 rounded-xl text-sm transition-all shadow-md"
        >
          {bookingLoading ? t('submitting') : t('submit', { price: formatPrice(totalMinor) })}
        </button>
      </form>
    </div>
  );
}
