'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'

/**
 * Inline waitlist join form (spec 006 US1, T622; i18n per spec 010):
 * rendered by SlotGrid in the "No available slots" branch.
 */
export function WaitlistJoinForm({ serviceId }: { serviceId: string }) {
  const t = useTranslations('booking.waitlist')
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
        setMessage(t('done'))
      } else if (data.error === 'WAITLIST_DUPLICATE') {
        setState('error')
        setMessage(t('duplicate'))
      } else if (data.error === 'WAITLIST_CAP_REACHED') {
        setState('error')
        setMessage(t('capReached'))
      } else {
        setState('error')
        setMessage(t('error', { error: data.error ?? res.status }))
      }
    } catch {
      setState('error')
      setMessage(t('error', { error: 'network' }))
    }
  }

  if (state === 'done') return <p role="status">{message}</p>

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <p>{t('title')}</p>
      {state === 'error' && <p role="alert">{message}</p>}
      <div>
        <label htmlFor="wl-name" className="mb-1 block text-sm font-medium">{t('name')}</label>
        <input id="wl-name" name="customerName" placeholder={t('name')} required maxLength={200}
          autoComplete="name" className="w-full rounded border border-neutral-300 px-3 py-2" />
      </div>
      <div>
        <label htmlFor="wl-phone" className="mb-1 block text-sm font-medium">{t('phone')}</label>
        <input id="wl-phone" name="customerPhone" placeholder={t('phone')} required maxLength={50}
          autoComplete="tel" className="w-full rounded border border-neutral-300 px-3 py-2" />
      </div>
      <div>
        <label htmlFor="wl-email" className="mb-1 block text-sm font-medium">{t('email')}</label>
        <input id="wl-email" name="customerEmail" type="email" placeholder={t('email')} required
          autoComplete="email" className="w-full rounded border border-neutral-300 px-3 py-2" />
      </div>
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
        {state === 'working' ? t('submitting') : t('submit')}
      </button>
    </form>
  )
}
