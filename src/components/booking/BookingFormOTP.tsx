'use client'

import { useState } from 'react'

interface BookingData {
  reservationId: string
  accessToken: string
  cancelToken: string
}

/**
 * OTP step of the booking form (spec 007 US1/US5, T720/T721): the client
 * enters the 6-digit code from the email; resend rotates the code on the
 * SAME intent (F2, ≤ 3 / 10 min). A wrong code ×5 kills the intent — the
 * honest error sends the client back to the grid.
 */
export function BookingFormOTP({
  intentId,
  expiresAt,
  emailSent,
  onVerified,
  onBack,
}: {
  intentId: string
  expiresAt: string
  emailSent: boolean
  onVerified: (result: BookingData) => void
  onBack?: () => void
}) {
  const [code, setCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [resending, setResending] = useState(false)
  const [resendNote, setResendNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isConflict, setIsConflict] = useState(false)

  const verify = async () => {
    setSubmitting(true)
    setError(null)
    setIsConflict(false)
    try {
      const res = await fetch('/api/booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intentId, otp: code }),
      })
      if (res.status === 201) {
        onVerified((await res.json()) as BookingData)
        return
      }
      const data = (await res.json()) as { error?: string }
      if (data.error === 'OTP_INVALID') {
        setError('Неверный код. Проверьте письмо — осталось не более 5 попыток.')
        return
      }
      if (data.error === 'INTENT_DEAD') {
        setError('Код исчерпан или истёк. Выберите слот заново.')
        return
      }
      if (data.error === 'SLOT_TAKEN') {
        setIsConflict(true)
        setError('Увы — слот только что заняли. Выберите другой.')
        return
      }
      setError(data.error ?? 'Не удалось подтвердить код')
    } catch {
      setError('Сетевая ошибка, попробуйте ещё раз.')
    } finally {
      setSubmitting(false)
    }
  }

  const resend = async () => {
    setResending(true)
    setResendNote(null)
    try {
      const res = await fetch('/api/booking/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intentId }),
      })
      const data = (await res.json()) as { error?: string }
      if (res.status === 200) {
        setResendNote('Новый код отправлен.')
        return
      }
      if (data.error === 'RATE_LIMITED') {
        setResendNote('Слишком часто — подождите пару минут.')
        return
      }
      setResendNote(`Не удалось: ${data.error ?? res.status}`)
    } catch {
      setResendNote('Сетевая ошибка, попробуйте ещё раз.')
    } finally {
      setResending(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-neutral-200 p-4" data-testid="booking-otp-step">
      <p>
        Код подтверждения отправлен на вашу почту
        {emailSent ? '' : ' (письмо задержалось — воспользуйтесь «Отправить код ещё раз»)'}.
        Действует до {new Date(expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.
      </p>
      <div>
        <label htmlFor="booking-otp" className="mb-1 block text-sm font-medium">
          Код из письма
        </label>
        <input
          id="booking-otp"
          data-testid="booking-otp"
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          className="w-32 rounded border border-neutral-300 px-3 py-2 tracking-widest"
        />
      </div>
      <button
        type="button"
        data-testid="booking-otp-verify"
        disabled={submitting || code.length !== 6}
        onClick={() => void verify()}
        className="rounded bg-primary px-4 py-2 text-white disabled:opacity-50"
      >
        {submitting ? 'Проверяем…' : 'Подтвердить и забронировать'}
      </button>
      <button
        type="button"
        data-testid="booking-otp-resend"
        disabled={resending}
        onClick={() => void resend()}
        className="text-sm text-neutral-500 underline disabled:opacity-50"
      >
        {resending ? 'Отправляем…' : 'Отправить код ещё раз'}
      </button>
      {onBack && (
        <button
          type="button"
          data-testid="booking-otp-back"
          onClick={onBack}
          className="text-sm text-neutral-500 hover:text-neutral-700 underline text-left"
        >
          ← Выбрать другой слот
        </button>
      )}
      {resendNote && <p role="status">{resendNote}</p>}
      {error && (
        <p
          role="alert"
          className="text-error"
          {...(isConflict ? { 'data-testid': 'booking-conflict' } : {})}
        >
          {error}
        </p>
      )}
    </div>
  )
}
