'use client'

import { useState } from 'react'

/**
 * Claim confirmation (spec 006 US3, review F9): the Confirm click posts to the
 * claim endpoint; on success navigates to the confirmation page; a 409
 * SLOT_TAKEN renders an HONEST refusal (no AcknowledgeClient-style success
 * mapping — the slot is genuinely gone).
 */
export function ClaimWaitlistClient({ entryId, token }: { entryId: string; token: string }) {
  const [state, setState] = useState<'idle' | 'working' | 'won' | 'lost' | 'error'>('idle')
  const [message, setMessage] = useState('')

  async function confirm() {
    setState('working')
    try {
      const res = await fetch(`/api/waitlist/${encodeURIComponent(entryId)}/claim?token=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idempotencyKey: `wl-claim-${entryId}-${token.slice(0, 16)}` }),
      })
      const data = (await res.json()) as {
        reservationId?: number
        accessToken?: string
        cancelToken?: string
        error?: string
      }
      if (res.status === 201 && data.reservationId && data.accessToken) {
        window.location.href =
          `/book/confirmation/${data.reservationId}` +
          `?accessToken=${encodeURIComponent(data.accessToken)}` +
          `&cancelToken=${encodeURIComponent(data.cancelToken ?? '')}`
        return
      }
      if (data.error === 'SLOT_TAKEN') {
        setState('lost')
        setMessage('Слот уже занят другим клиентом. Мы уведомим вас о следующем окне.')
        return
      }
      if (data.error === 'WAITLIST_TOKEN_INVALID') {
        setState('error')
        setMessage('Ссылка недействительна или срок её истёк.')
        return
      }
      setState('error')
      setMessage(`Не удалось: ${data.error ?? res.status}`)
    } catch {
      setState('error')
      setMessage('Сетевая ошибка, попробуйте ещё раз.')
    }
  }

  if (state === 'lost') return <p role="status">{message}</p>
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
    <button type="button" onClick={() => void confirm()} disabled={state === 'working'}>
      {state === 'working' ? 'Закрепляем…' : 'Закрепить слот за собой'}
    </button>
  )
}
