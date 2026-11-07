'use client'

import { useState } from 'react'

/**
 * Client confirmation form (spec 003 US4, review F4): the POST — the only
 * token-consuming action — happens strictly after an explicit user click, so
 * email prefetch scanners that hit the GET page can never burn the token.
 */
export function ConfirmCancelForm({ bookingId, token }: { bookingId: string; token: string }) {
  const [state, setState] = useState<'idle' | 'working' | 'cancelled' | 'error'>('idle')
  const [message, setMessage] = useState('')

  async function submit() {
    setState('working')
    try {
      const res = await fetch(`/api/booking/${bookingId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cancelToken: token }),
      })
      const data = (await res.json()) as { status?: string; refund?: string; error?: string }
      if (res.ok && data.status === 'cancelled') {
        setState('cancelled')
        setMessage(
          data.refund === 'auto-refunded'
            ? 'Booking cancelled. Your refund is on its way.'
            : data.refund === 'refund_requested'
              ? 'Booking cancelled. A refund request was sent to the staff (24h SLA).'
              : 'Booking cancelled.',
        )
      } else {
        setState('error')
        setMessage(data.error === 'TOKEN_ALREADY_CONSUMED' ? 'Already cancelled.' : `Failed: ${data.error ?? res.status}`)
      }
    } catch {
      setState('error')
      setMessage('Network error, try again.')
    }
  }

  if (state === 'cancelled') return <p role="status">{message}</p>

  return (
    <div>
      <p>Do you really want to cancel this booking?</p>
      {state === 'error' && <p role="alert">{message}</p>}
      <button onClick={submit} disabled={state === 'working'}>
        {state === 'working' ? 'Cancelling…' : 'Confirm cancellation'}
      </button>
    </div>
  )
}
