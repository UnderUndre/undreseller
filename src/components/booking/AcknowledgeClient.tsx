'use client'

import { useEffect, useState } from 'react'

/**
 * Reminder acknowledgement (spec 003 US3): one-click CAS bump.
 * 409 CONFLICT is a SUCCESS for this auto-fire UI: it means a concurrent
 * duplicate (React StrictMode double-effect in dev, double-tap) already
 * bumped the version — the acknowledgement is recorded either way.
 */
export function AcknowledgeClient({ accessToken }: { accessToken: string }) {
  const [state, setState] = useState<'idle' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState('')

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/booking/acknowledge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accessToken }),
        })
        const data = (await res.json()) as { status?: string; error?: string }
        if ((res.ok && data.status === 'acknowledged') || (res.status === 409 && data.error === 'CONFLICT')) {
          setState('done')
          setMessage('Thanks — we will keep your slot.')
        } else {
          setState('error')
          setMessage(`Failed: ${data.error ?? res.status}`)
        }
      } catch {
        setState('error')
        setMessage('Network error, try again.')
      }
    })()
  }, [accessToken])

  if (state === 'done') return <p role="status">{message}</p>
  if (state === 'error') return <p role="alert">{message}</p>
  return <p>Confirming…</p>
}
