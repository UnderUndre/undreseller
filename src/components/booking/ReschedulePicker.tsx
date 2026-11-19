'use client'

import { useCallback, useEffect, useState } from 'react'

/**
 * Reschedule picker (spec 003 US4, review F5): the old slot stays booked until
 * the new slot is committed atomically (POST /api/booking/[id]/reschedule).
 * Closing the tab here is always safe.
 */
export function ReschedulePicker({ bookingId, token, productId, itemIds = [] }: { bookingId: string; token: string; productId: string; itemIds?: string[] }) {
  const [date, setDate] = useState('')
  const [slots, setSlots] = useState<{ start: string }[]>([])
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState('')

  const loadSlots = useCallback(async () => {
    if (!date) return
    setState('loading')
    try {
      // 015 (fix AG-F5): composite baskets request the CONTAINER grid — the
      // primary product's own 60-min grid would render illegal slots (e.g.
      // 17:00–18:00 for a 75-min container) that fail on confirm.
      const params = new URLSearchParams({ service: productId, date })
      if (itemIds.length > 0) {
        for (const id of itemIds) {
          params.append('items', id)
        }
      }
      const res = await fetch(`/api/availability?${params.toString()}`)
      const data = (await res.json()) as { slots?: { start: string; end: string }[] }
      setSlots(Array.isArray(data.slots) ? data.slots : [])
      setState('idle')
    } catch {
      setState('error')
      setMessage('Could not load availability.')
    }
  }, [date, productId, itemIds])

  useEffect(() => {
    void loadSlots()
  }, [loadSlots])

  async function pick(slotStart: string) {
    setState('loading')
    try {
      const res = await fetch(`/api/booking/${bookingId}/reschedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rescheduleToken: token, newStart: slotStart }),
      })
      const data = (await res.json()) as { newStart?: string; error?: string }
      if (res.ok && data.newStart) {
        setState('done')
        setMessage(`Moved to ${new Date(data.newStart).toLocaleString()}`)
      } else {
        setState('error')
        setMessage(data.error === 'SLOT_TAKEN' ? 'Slot just taken — pick another.' : `Failed: ${data.error ?? res.status}`)
      }
    } catch {
      setState('error')
      setMessage('Network error, try again.')
    }
  }

  if (state === 'done') return <p role="status" data-testid="reschedule-status">{message}</p>

  return (
    <div data-testid="reschedule-picker">
      <label>
        New date:{' '}
        <input type="date" data-testid="reschedule-date" value={date} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)} />
      </label>
      {state === 'error' && <p role="alert" data-testid="reschedule-error">{message}</p>}
      {date && slots.length === 0 && state !== 'loading' ? (
        <p>No slots for this date.</p>
      ) : (
        <ul>
          {slots.map((slot) => (
            <li key={slot.start}>
              <button data-testid="reschedule-slot" data-slot-start={slot.start} onClick={() => pick(slot.start)} disabled={state === 'loading'}>
                {new Date(slot.start).toLocaleTimeString()}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
