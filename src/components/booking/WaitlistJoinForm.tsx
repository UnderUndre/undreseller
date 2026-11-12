'use client'

import { useState } from 'react'

/**
 * Inline waitlist join form (spec 006 US1, T622; double-opt-in per spec 007
 * FR-704): rendered by SlotGrid in the "No available slots" branch. Email is
 * REQUIRED in the email-only MVP (review F3). Since 007 the join lands in
 * `pending` — the client must confirm via the opt-in email before matching.
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
          companyWebsite: form.get('companyWebsite') ?? '',
        }),
      })
      const data = (await res.json()) as { entryId?: number; error?: string }
      if (res.status === 201 || res.status === 200) {
        setState('done')
        setMessage(
          'Мы отправили письмо со ссылкой подтверждения — подтвердите подписку, чтобы попасть в очередь.',
        )
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
      <div>
        <label htmlFor="wl-name" className="mb-1 block text-sm font-medium">Имя</label>
        <input id="wl-name" name="customerName" placeholder="Имя" required maxLength={200}
          autoComplete="name" className="w-full rounded border border-neutral-300 px-3 py-2" />
      </div>
      <div>
        <label htmlFor="wl-phone" className="mb-1 block text-sm font-medium">Телефон</label>
        <input id="wl-phone" name="customerPhone" placeholder="Телефон" required maxLength={50}
          autoComplete="tel" className="w-full rounded border border-neutral-300 px-3 py-2" />
      </div>
      <div>
        <label htmlFor="wl-email" className="mb-1 block text-sm font-medium">Email</label>
        <input id="wl-email" name="customerEmail" type="email" placeholder="Email" required
          autoComplete="email" className="w-full rounded border border-neutral-300 px-3 py-2" />
      </div>
      {/* Honeypot (FR-703): invisible to humans, a11y-safe, bots fill it. */}
      <input
        name="companyWebsite"
        type="text"
        aria-hidden="true"
        tabIndex={-1}
        autoComplete="off"
        className="hidden"
      />
      <button type="submit" disabled={state === 'working'}
        className="rounded bg-primary px-4 py-2 text-white disabled:opacity-50">
        {state === 'working' ? 'Отправляем…' : 'Уведомить меня'}
      </button>
    </form>
  )
}
