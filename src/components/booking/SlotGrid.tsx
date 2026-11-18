'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'

import type { ComputedSlotDTO, CompositeItemDTO } from '@/components/booking/types'
import { BookingFormOTP } from '@/components/booking/BookingFormOTP'
import { WaitlistJoinForm } from '@/components/booking/WaitlistJoinForm'

/**
 * Client slot grid (spec 002 US7; two-phase trust gate per spec 007; i18n per
 * spec 010): fetches availability for the selected date, renders the grid.
 * All user-facing strings go through next-intl `t()`.
 *
 * 014 FR-1405 (T1432): «Добавить к визит» checkbox block — a running
 * Σ duration/Σ price total, grid recompute for the composite duration (every
 * selection change re-fetches the container grid via repeated `items`
 * query-params), and an `items[]` submit. A single-slot basket keeps the
 * legacy `productId` submit (bitwise compat).
 */
export function SlotGrid({
  serviceId,
  primaryService,
  availableAddOns = [],
  onBooked,
}: {
  serviceId: string
  primaryService?: CompositeItemDTO
  availableAddOns?: CompositeItemDTO[]
  onBooked?: (result: { reservationId: string; accessToken: string; cancelToken: string }) => void
}) {
  const t = useTranslations('booking')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [slots, setSlots] = useState<ComputedSlotDTO[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [selectedAddOnIds, setSelectedAddOnIds] = useState<string[]>([])
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [customerNotes, setCustomerNotes] = useState('')
  const [honeypot, setHoneypot] = useState('')
  const [otpPhase, setOtpPhase] = useState<
    { intentId: string; expiresAt: string; emailSent: boolean } | null
  >(null)
  const [submitting, setSubmitting] = useState(false)
  const [conflict, setConflict] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedItems = useMemo(
    () => availableAddOns.filter((a) => selectedAddOnIds.includes(a.productId)),
    [availableAddOns, selectedAddOnIds],
  )
  const isComposite = selectedItems.length > 0
  const totalDurationMin =
    (primaryService?.durationMin ?? 0) + selectedItems.reduce((s, i) => s + (i.durationMin ?? 0), 0)
  const totalPrice = (primaryService?.priceInUSD ?? 0) + selectedItems.reduce((s, i) => s + (i.priceInUSD ?? 0), 0)

  const loadSlots = useCallback(async () => {
    setLoading(true)
    setConflict(false)
    try {
      const params = new URLSearchParams({ service: serviceId, date })
      for (const addOnId of selectedAddOnIds) {
        params.append('items', serviceId)
        params.append('items', addOnId)
      }
      const res = await fetch(`/api/availability?${params.toString()}`)
      const data = (await res.json()) as { slots?: ComputedSlotDTO[] }
      setSlots(data.slots ?? [])
    } catch {
      setError(t('networkError'))
      setSlots([])
    } finally {
      setLoading(false)
    }
  }, [serviceId, date, selectedAddOnIds, t])

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
          // Composite basket → items[]; single-slot basket → legacy productId
          // (bitwise-compat fast path, spec 014 FR-1402).
          ...(isComposite ? { items: [serviceId, ...selectedAddOnIds] } : { productId: serviceId }),
          start: selected,
          customerName,
          customerPhone,
          customerEmail,
          customerNotes: customerNotes.trim() || undefined,
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
      navigateToConfirmation((await res.json()) as { reservationId: string; accessToken: string; cancelToken: string })
    } catch {
      setError(t('networkError'))
    } finally {
      setSubmitting(false)
    }
  }

  const toggleAddOn = (productId: string) => {
    setSelectedAddOnIds((prev) =>
      prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId],
    )
    setSelected(null)
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
              {t('date')}
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

          {availableAddOns.length > 0 && (
            <fieldset data-testid="addon-block" className="rounded-lg border border-neutral-200 p-4">
              <legend className="mb-2 text-sm font-medium">{t('addToVisit')}</legend>
              <div className="flex flex-col gap-2">
                {availableAddOns.map((addOn) => (
                  <label key={addOn.productId} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      data-testid={`addon-${addOn.productId}`}
                      checked={selectedAddOnIds.includes(addOn.productId)}
                      onChange={() => toggleAddOn(addOn.productId)}
                    />
                    <span>
                      {addOn.title}
                      {addOn.addOn ? ` · ${t('includedInSlot')}` : ` · ${addOn.durationMin} min`} · $
                      {addOn.priceInUSD.toFixed(2)}
                    </span>
                  </label>
                ))}
              </div>
              <p className="mt-2 text-sm text-neutral-500" data-testid="basket-total">
                {t('basketTotal')}: {totalDurationMin} min · ${totalPrice.toFixed(2)}
              </p>
            </fieldset>
          )}

          {loading ? (
            <p className="text-muted-foreground">{t('loadingSlots')}</p>
          ) : slots.length === 0 ? (
            <>
              <p className="text-muted-foreground">{t('noSlotsAvailable')}</p>
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
                  {t('name')}
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
                  {t('phone')}
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
                  {t('email')}
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
              <div>
                <label htmlFor="customer-notes" className="mb-1 block text-sm font-medium">
                  {t('notes')}
                </label>
                <textarea
                  id="customer-notes"
                  data-testid="customer-notes"
                  value={customerNotes}
                  onChange={(e) => setCustomerNotes(e.target.value)}
                  placeholder={t('notesPlaceholder')}
                  className="w-full rounded border border-neutral-300 px-3 py-2"
                  rows={3}
                  maxLength={2000}
                />
              </div>
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
                {submitting ? t('booking') : t('confirmBooking')}
              </button>
            </div>
          )}
        </>
      )}

      {conflict && (
        <p data-testid="booking-conflict" role="alert" className="text-error">
          {t('slotTaken')}
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
