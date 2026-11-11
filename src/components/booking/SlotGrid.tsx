'use client'

import { useCallback, useEffect, useState } from 'react'

import type { ComputedSlotDTO } from '@/components/booking/types'
import { BookingFormOTP } from '@/components/booking/BookingFormOTP'
import { WaitlistJoinForm } from '@/components/booking/WaitlistJoinForm'

/**
 * Client slot grid (spec 002-booking-domain US7; two-phase trust gate per
 * spec 007): fetches availability for the selected date, renders the grid;
 * on booking conflict (409 SLOT_TAKEN) shows the conflict message and
 * refreshes the grid (race canon, TC-002-021). Since 007 the booking submit
 * is TWO-phase: phase 1 → 202 + email code (or a direct 201 with a valid
 * trust cookie); phase 2 → OTP step in the same form (BookingFormOTP).
 */
export function SlotGrid({
  serviceId,
  onBooked,
}: {
  serviceId: string
  /** Optional: defaults to navigating to the confirmation page. Server
   * Components cannot pass function props — the navigation lives here. */
  onBooked?: (result: { reservationId: string; accessToken: string; cancelToken: string }) => void
}) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [slots, setSlots] = useState<ComputedSlotDTO[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  // Honeypot (spec 007 FR-703): hidden field — humans never see or fill it.
  const [honeypot, setHoneypot] = useState('')
  const [otpPhase, setOtpPhase] = useState<
    { intentId: string; expiresAt: string; emailSent: boolean } | null
  >(null)
  const [submitting, setSubmitting] = useState(false)
  const [conflict, setConflict] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadSlots = useCallback(async () => {
    setLoading(true)
    setConflict(false)
    try {
      const res = await fetch(
        `/api/availability?service=${encodeURIComponent(serviceId)}&date=${encodeURIComponent(date)}`,
      )
      const data = (await res.json()) as { slots?: ComputedSlotDTO[] }
      setSlots(data.slots ?? [])
    } catch {
      setError('Failed to load availability')
      // 008 T821 (F-UX-17 / Antigravity F11): availability failure clears stale slots
      setSlots([])
    } finally {
      setLoading(false)
    }
  }, [serviceId, date])

  useEffect(() => {
    void loadSlots()
  }, [loadSlots])

  const navigateToConfirmation = (data: { reservationId: string; accessToken: string; cancelToken: string }) => {
    if (onBooked) {
      onBooked(data)
    } else {
      window.location.href =
        `/book/confirmation/${data.reservationId}` +
        `?accessToken=${encodeURIComponent(data.accessToken)}` +
        `&cancelToken=${encodeURIComponent(data.cancelToken)}`
    }
  }

  const submit = async () => {
    if (!selected) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: serviceId,
          start: selected,
          customerName,
          customerPhone,
          customerEmail,
          companyWebsite: honeypot,
        }),
      })
      if (res.status === 409) {
        setConflict(true)
        await loadSlots()
        setSelected(null)
        return
      }
      if (res.status === 202) {
        const data = (await res.json()) as { intentId: string; expiresAt: string; emailSent?: boolean }
        setOtpPhase({ intentId: data.intentId, expiresAt: data.expiresAt, emailSent: data.emailSent !== false })
        return
      }
      if (!res.ok) {
        const data = (await res.json()) as { error?: string }
        setError(data.error ?? 'Booking failed')
        return
      }
      // 201 — either the trust-cookie path or an idempotent replay: no OTP step.
      navigateToConfirmation((await res.json()) as { reservationId: string; accessToken: string; cancelToken: string })
    } catch {
      // 008 T821 (F-UX-04 / Antigravity F11): submit failure displays error WITHOUT wiping slots
      setError('Network error, please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div data-testid="slot-grid" className="flex flex-col gap-4">
      {otpPhase ? (
        <BookingFormOTP
          intentId={otpPhase.intentId}
          expiresAt={otpPhase.expiresAt}
          emailSent={otpPhase.emailSent}
          onVerified={navigateToConfirmation}
          onBack={() => setOtpPhase(null)}
        />
      ) : (
        <>
          <div>
            <label htmlFor="booking-date" className="mb-1 block text-sm font-medium">
              Date
            </label>
            <input
              id="booking-date"
              type="date"
              value={date}
              min={new Date().toISOString().slice(0, 10)}
              onChange={(e) => {
                setDate(e.target.value)
                setSelected(null)
              }}
              className="rounded border border-neutral-300 px-3 py-2"
            />
          </div>

          {loading ? (
            <p className="text-neutral-500">Loading slots…</p>
          ) : slots.length === 0 ? (
            <>
              <p className="text-neutral-500">No available slots on this date.</p>
              <WaitlistJoinForm serviceId={serviceId} />
            </>
          ) : (
            <div className="flex flex-wrap gap-2">
              {slots.map((slot) => (
                <button
                  key={slot.start}
                  type="button"
                  data-testid="slot-option"
                  data-slot-start={slot.start}
                  onClick={() => setSelected(slot.start)}
                  className={`rounded border px-3 py-2 text-sm transition-colors ${
                    selected === slot.start
                      ? 'border-primary bg-primary text-white'
                      : 'border-neutral-300 hover:border-primary'
                  }`}
                >
                  {new Date(slot.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </button>
              ))}
            </div>
          )}

          {selected && (
            <div className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-4">
              <div>
                <label htmlFor="customer-name" className="mb-1 block text-sm font-medium">
                  Name
                </label>
                <input
                  id="customer-name"
                  data-testid="customer-name"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full rounded border border-neutral-300 px-3 py-2"
                  maxLength={200}
                />
              </div>
              <div>
                <label htmlFor="customer-phone" className="mb-1 block text-sm font-medium">
                  Phone
                </label>
                <input
                  id="customer-phone"
                  data-testid="customer-phone"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  className="w-full rounded border border-neutral-300 px-3 py-2"
                  maxLength={50}
                />
              </div>
              <div>
                <label htmlFor="customer-email" className="mb-1 block text-sm font-medium">
                  Email
                </label>
                <input
                  id="customer-email"
                  data-testid="customer-email"
                  type="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  className="w-full rounded border border-neutral-300 px-3 py-2"
                />
              </div>
              {/* Honeypot (FR-703): invisible to humans, a11y-safe, bots fill it. */}
              <input
                name="companyWebsite"
                aria-hidden="true"
                tabIndex={-1}
                autoComplete="off"
                value={honeypot}
                onChange={(e) => setHoneypot(e.target.value)}
                className="hidden"
              />
              <button
                type="button"
                data-testid="booking-submit"
                disabled={submitting || !customerName || !customerPhone || !customerEmail}
                onClick={() => void submit()}
                className="rounded bg-primary px-4 py-2 text-white disabled:opacity-50"
              >
                {submitting ? 'Booking…' : 'Confirm booking'}
              </button>
            </div>
          )}
        </>
      )}

      {conflict && (
        <p data-testid="booking-conflict" role="alert" className="text-error">
          Sorry — this slot has just been taken. The grid below has been refreshed.
        </p>
      )}
      {error && (
        <p role="alert" className="text-error">
          {error}
        </p>
      )}
    </div>
  )
}
