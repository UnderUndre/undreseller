'use client'

import { useState } from 'react'

/**
 * Double-opt-in confirm button (spec 007 FR-704, review F9): the landing's
 * explicit POST — scanning/previewing the email (SafeLinks) only ever opens
 * the GET page and NEVER mutates. Idempotent: an already-confirmed entry
 * renders an honest "already confirmed" state.
 */
export function ConfirmOptinClient({ entryId, token }: { entryId: string; token: string }) {
  const [state, setState] = useState<'idle' | 'working' | 'done' | 'already' | 'error'>('idle')
  const [message, setMessage] = useState('')

  async function confirm() {
    setState('working')
    try {
      const res = await fetch(`/api/waitlist/${encodeURIComponent(entryId)}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const data = (await res.json()) as { status?: string; error?: string }
      if (res.status === 200 && data.status === 'waiting') {
        setState('done')
        setMessage('Подписка подтверждена — сообщим, когда появится слот.')
        return
      }
      if (res.status === 200 && data.status === 'already_confirmed') {
        setState('already')
        setMessage('Эта подписка уже подтверждена.')
        return
      }
      if (data.error === 'WAITLIST_TOKEN_INVALID') {
        setState('error')
        setMessage('Ссылка недействительна или срок её истёк — оставьте заявку заново.')
        return
      }
      setState('error')
      setMessage(`Не удалось: ${data.error ?? res.status}`)
    } catch {
      setState('error')
      setMessage('Сетевая ошибка, попробуйте ещё раз.')
    }
  }

  if (state === 'done' || state === 'already') return <p role="status">{message}</p>
  if (state === 'error')
    return (
      <div role="alert" className="flex flex-col gap-2">
        <p>{message}</p>
        {message.includes('Сетевая') && (
          <button type="button" onClick={() => void confirm()} className="text-sm underline text-neutral-500 hover:text-neutral-700">
            Попробовать снова
          </button>
        )}
      </div>
    )
  return (
    <button type="button" onClick={() => void confirm()} disabled={state === 'working'} data-testid="optin-confirm">
      {state === 'working' ? 'Подтверждаем…' : 'Подтвердить подписку'}
    </button>
  )
}
