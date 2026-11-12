'use client'

import { useCallback, useEffect, useState } from 'react'

/**
 * Reschedule picker (spec 003 US4, review F5): the old slot stays booked until
 * the new slot is committed atomically (POST /api/booking/[id]/reschedule).
 * Closing the tab here is always safe.
 */
export function ReschedulePicker({ bookingId, token, productId }: { bookingId: string; token: string; productId: string }) {
  const [date, setDate] = useState('')
  const [slots, setSlots] = useState<{ start: string }[]>([])
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState('')

  const loadSlots = useCallback(async () => {
    if (!date) return
    setState('loading')
    try {
      const res = await fetch(`/api/availability?service=${encodeURIComponent(productId)}&date=${date}`)
      const data = (await res.json()) as { slots?: { start: string; end: string }[] }
      setSlots(Array.isArray(data.slots) ? data.slots : [])
      setState('idle')
    } catch {
      setState('error')
      setMessage('Could not load availability.')
    }
  }, [date, productId])

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

  if (state === 'done') return <p role="status">{message}</p>

  return (
    <div>
      <label>
        New date:{' '}
        <input type="date" value={date} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)} />
      </label>
      {state === 'error' && <p role="alert">{message}</p>}
      {date && slots.length === 0 && state !== 'loading' ? (
        <p>No slots for this date.</p>
      ) : (
        <ul>
          {slots.map((slot) => (
            <li key={slot.start}>
              <button onClick={() => pick(slot.start)} disabled={state === 'loading'}>
                {new Date(slot.start).toLocaleTimeString()}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
