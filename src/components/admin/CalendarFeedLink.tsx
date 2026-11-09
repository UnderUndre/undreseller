'use client'

import { useState } from 'react'

/**
 * Minimal owner surface (spec 005 T521, US3): copy webcal link + rotate token.
 */
export function CalendarFeedLink({ resourceId }: { resourceId: string | number }) {
  const [url, setUrl] = useState<string | null>(null)
  const [state, setState] = useState<'idle' | 'error'>('idle')

  async function load(rotate: boolean) {
    setState('idle')
    try {
      const res = await fetch(`/api/admin/calendar-feed/${resourceId}`, {
        method: rotate ? 'POST' : 'GET',
      })
      const data = (await res.json()) as { webcalUrl?: string; error?: string }
      if (res.ok && data.webcalUrl) {
        setUrl(data.webcalUrl)
      } else {
        setState('error')
      }
    } catch {
      setState('error')
    }
  }

  return (
    <div>
      {url ? (
        <p>
          <code>{url}</code>{' '}
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(url)
            }}
          >
            Copy
          </button>
        </p>
      ) : (
        <button type="button" onClick={() => void load(false)}>
          Show calendar link
        </button>
      )}{' '}
      <button type="button" onClick={() => void load(true)}>
        Rotate token
      </button>
      {state === 'error' && <p role="alert">Failed — try again.</p>}
    </div>
  )
}
