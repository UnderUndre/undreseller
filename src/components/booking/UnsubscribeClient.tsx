'use client'

import { useState } from 'react'

/** Unsubscribe confirmation (spec 006 FR-605): GET view → POST confirm. */
export function UnsubscribeClient({ entryId, token }: { entryId: string; token: string }) {
  const [state, setState] = useState<'idle' | 'working' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState('')

  async function confirm() {
    setState('working')
    try {
      const res = await fetch(`/api/waitlist/${encodeURIComponent(entryId)}?token=${encodeURIComponent(token)}`, {
        method: 'DELETE',
      })
      const data = (await res.json()) as { status?: string; error?: string }
      if (res.ok && data.status === 'cancelled') {
        setState('done')
        setMessage('Вы отписаны от уведомлений.')
      } else {
        setState('error')
        setMessage(`Не удалось: ${data.error ?? res.status}`)
      }
    } catch {
      setState('error')
      setMessage('Сетевая ошибка, попробуйте ещё раз.')
    }
  }

  if (state === 'done') return <p role="status">{message}</p>
  return (
    <div>
      <p>Отписаться от уведомлений листа ожидания?</p>
      {state === 'error' && <p role="alert">{message}</p>}
      <button type="button" onClick={() => void confirm()} disabled={state === 'working'}>
        {state === 'working' ? 'Отписываем…' : 'Да, отписаться'}
      </button>
    </div>
  )
}
