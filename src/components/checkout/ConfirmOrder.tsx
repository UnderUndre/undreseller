'use client'

import { LoadingSpinner } from '@/components/LoadingSpinner'
import { useCart, usePayments } from '@payloadcms/plugin-ecommerce/client/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

export const ConfirmOrder: React.FC = () => {
  const { confirmOrder } = usePayments()
  const { cart } = useCart()

  const searchParams = useSearchParams()
  const router = useRouter()
  // Ensure we only confirm the order once, even if the component re-renders
  const isConfirming = useRef(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!cart || !cart.items || cart.items?.length === 0) {
      return
    }

    const paymentIntentID = searchParams.get('payment_intent')
    const email = searchParams.get('email')

    if (paymentIntentID) {
      if (!isConfirming.current) {
        isConfirming.current = true

        confirmOrder('stripe', {
          additionalData: {
            paymentIntentID,
          },
        })
          .then((result) => {
            if (result && typeof result === 'object' && 'orderID' in result && result.orderID) {
              const accessToken = 'accessToken' in result ? (result.accessToken as string) : ''
              const queryParams = new URLSearchParams()

              if (email) {
                queryParams.set('email', email)
              }
              if (accessToken) {
                queryParams.set('accessToken', accessToken)
              }

              const queryString = queryParams.toString()
              router.push(`/orders/${result.orderID}${queryString ? `?${queryString}` : ''}`)
            } else {
              setError('Не удалось подтвердить заказ. Пожалуйста, попробуйте снова.')
            }
          })
          .catch(() => {
            // 008 T830 (F-UX-05): network/server error displays honest error + retry
            setError('Ошибка сети при подтверждении заказа. Попробуйте ещё раз.')
          })
      }
    } else {
      // If no payment intent ID is found, redirect to the home
      router.push('/')
    }
  }, [cart, confirmOrder, router, searchParams, error])

  if (error) {
    return (
      <div className="text-center w-full flex flex-col items-center justify-start gap-4" role="alert">
        <h1 className="text-2xl font-bold">Подтверждение заказа</h1>
        <p className="text-error">{error}</p>
        <button
          type="button"
          onClick={() => {
            isConfirming.current = false
            setError(null)
          }}
          className="rounded bg-primary px-4 py-2 text-white hover:opacity-90"
        >
          Попробовать снова
        </button>
      </div>
    )
  }

  return (
    <div className="text-center w-full flex flex-col items-center justify-start gap-4">
      <h1 className="text-2xl">Confirming Order</h1>

      <LoadingSpinner className="w-12 h-6" />
    </div>
  )
}
