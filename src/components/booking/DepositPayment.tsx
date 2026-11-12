'use client'

import { FormEvent, useState } from 'react'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { loadStripe } from '@stripe/stripe-js'
import { useTranslations } from 'next-intl'

interface DepositPaymentProps {
  clientSecret: string
  bookingId: string | number
  depositAmount: number
  totalPrice?: number
  publishableKey?: string
}

function DepositForm({
  depositAmount,
  totalPrice,
}: {
  depositAmount: number
  totalPrice?: number
}) {
  const stripe = useStripe()
  const elements = useElements()
  const t = useTranslations('confirmation.deposit')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [paid, setPaid] = useState(false)

  const remaining = typeof totalPrice === 'number' && totalPrice > depositAmount
    ? (totalPrice - depositAmount).toFixed(2)
    : null

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!stripe || !elements) return

    setSubmitting(true)
    setError(null)

    try {
      const { error: stripeError, paymentIntent } = await stripe.confirmPayment({
        elements,
        redirect: 'if_required',
      })

      if (stripeError) {
        setError(stripeError.message ?? t('paymentFailed'))
      } else if (paymentIntent && (paymentIntent.status === 'succeeded' || paymentIntent.status === 'processing')) {
        setPaid(true)
        // Refresh page after webhook/payment settles
        setTimeout(() => {
          window.location.reload()
        }, 1500)
      }
    } catch {
      setError(t('networkError'))
    } finally {
      setSubmitting(false)
    }
  }

  if (paid) {
    return (
      <div className="rounded-lg border border-primary/20 bg-primary/5 p-6 text-center" data-testid="deposit-success">
        <p className="text-lg font-semibold text-primary">{t('depositReceived')}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t('refreshing')}</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-lg border border-border p-6" data-testid="deposit-payment-form">
      <div>
        <h2 className="text-xl font-bold">{t('title')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('depositNotice', { amount: `$${depositAmount}` })}
          {remaining && ` ${t('remainingNotice', { remaining: `$${remaining}` })}`}
        </p>
      </div>

      <div className="my-2">
        <PaymentElement />
      </div>

      {error && (
        <p role="alert" className="text-sm text-error">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={!stripe || !elements || submitting}
        data-testid="deposit-pay-button"
        className="rounded bg-primary px-4 py-2.5 font-medium text-white transition-opacity disabled:opacity-50"
      >
        {submitting ? t('processing') : t('payDeposit', { amount: `$${depositAmount}` })}
      </button>
    </form>
  )
}

export function DepositPayment({
  clientSecret,
  depositAmount,
  totalPrice,
  publishableKey,
}: DepositPaymentProps) {
  const apiKey = publishableKey || process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || ''
  const [stripePromise] = useState(() => (apiKey ? loadStripe(apiKey) : null))

  if (!apiKey || !stripePromise) {
    return null
  }

  return (
    <div className="my-6 max-w-lg" data-testid="deposit-payment-section">
      <Elements stripe={stripePromise} options={{ clientSecret }}>
        <DepositForm depositAmount={depositAmount} totalPrice={totalPrice} />
      </Elements>
    </div>
  )
}
