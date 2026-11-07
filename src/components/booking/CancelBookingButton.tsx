'use client'

import { useState } from 'react'

/** One-time cancel via POST /api/booking/[id]/cancel (spec 002 US7 / 003 builds on this). */
export function CancelBookingButton({
  reservationId,
  cancelToken,
  label,
  testId,
}: {
  reservationId: string
  cancelToken: string
  label: string
  testId: string
}) {
  const [state, setState] = useState<'idle' | 'cancelled' | 'error'>('idle')
  const [busy, setBusy] = useState(false)

  const cancel = async () => {
    setBusy(true)
    try {
      const res = await fetch(`/api/booking/${encodeURIComponent(reservationId)}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cancelToken }),
      })
      setState(res.ok ? 'cancelled' : 'error')
    } catch {
      setState('error')
    } finally {
      setBusy(false)
    }
  }

  if (state === 'cancelled') {
    return <p className="text-success">The appointment has been cancelled.</p>
  }

  return (
    <div>
      <button
        type="button"
        data-testid={testId}
        onClick={() => void cancel()}
        disabled={busy}
        className="rounded bg-error px-4 py-2 text-white disabled:opacity-50"
      >
        {busy ? 'Cancelling…' : label}
      </button>
      {state === 'error' && (
        <p role="alert" className="mt-2 text-error">
          Cancel failed — the link may have already been used.
        </p>
      )}
    </div>
  )
}
