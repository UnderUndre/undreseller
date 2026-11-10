'use client'

import { useState } from 'react'

/**
 * Inline waitlist join form (spec 006 US1, T622): rendered by SlotGrid in the
 * "No available slots" branch. Email is REQUIRED in the email-only MVP
 * (review F3).
 */
export function WaitlistJoinForm({ serviceId }: { serviceId: string }) {
  const [state, setState] = useState<'idle' | 'working' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState('')

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setState('working')
    const form = new FormData(e.currentTarget)
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: form.get('customerName'),
          customerPhone: form.get('customerPhone'),
          customerEmail: form.get('customerEmail'),
          serviceId,
        }),
      })
      const data = (await res.json()) as { entryId?: number; error?: string }
      if (res.status === 201) {
        setState('done')
        setMessage('Готово — сообщим, когда появится слот.')
      } else if (data.error === 'WAITLIST_DUPLICATE') {
        setState('error')
        setMessage('Вы уже в очереди на эту услугу.')
      } else if (data.error === 'WAITLIST_CAP_REACHED') {
        setState('error')
        setMessage('Слишком много активных подписок — отмените одну из прежних.')
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
    <form onSubmit={submit} className="flex flex-col gap-3">
      <p>На эту дату слотов нет. Оставьте контакты — напишем, когда слот освободится.</p>
      {state === 'error' && <p role="alert">{message}</p>}
      <input name="customerName" placeholder="Имя" required maxLength={200} />
      <input name="customerPhone" placeholder="Телефон" required maxLength={50} />
      <input name="customerEmail" type="email" placeholder="Email" required />
      <button type="submit" disabled={state === 'working'}>
        {state === 'working' ? 'Отправляем…' : 'Уведомить меня'}
      </button>
    </form>
  )
}
