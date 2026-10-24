'use client';

import React, { useState } from 'react';
import { useTelegram } from '../tma/TelegramProvider';

interface InvoiceResultData {
  paymentMethod: 'PAY_ON_SITE' | 'TELEGRAM_STARS' | 'CRYPTO_GATEWAY';
  deferredUntilStaffApproval?: boolean;
  order?: {
    orderNumber: string;
    status: string;
    paymentType?: string;
  };
  starsPrice?: number;
  invoiceUrl?: string;
}

export function CheckoutModal({
  orderId,
  itemId,
  itemTitle,
  priceFormatted,
  starsPrice,
  defaultPaymentType = 'PREPAYMENT_ONLINE',
  prepaymentTiming = 'IMMEDIATE',
  allowPayOnSite = true,
  orderStatus = 'PENDING',
}: {
  orderId?: string;
  itemId?: string;
  itemTitle: string;
  priceFormatted: string;
  starsPrice?: number | null;
  defaultPaymentType?: 'PAY_ON_SITE' | 'PREPAYMENT_ONLINE';
  prepaymentTiming?: 'IMMEDIATE' | 'AFTER_STAFF_APPROVAL';
  allowPayOnSite?: boolean;
  orderStatus?: string;
}) {
  const { isTma, initDataRaw, user, hapticFeedback } = useTelegram();

  const [customerName, setCustomerName] = useState(user?.first_name || '');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');

  const [loading, setLoading] = useState(false);
  const [invoiceResult, setInvoiceResult] = useState<InvoiceResultData | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleSelectRail(
    method: 'PAY_ON_SITE' | 'TELEGRAM_STARS' | 'CRYPTO_GATEWAY'
  ) {
    setLoading(true);
    setErrorMsg(null);
    hapticFeedback.impactOccurred('medium');

    const payload: Record<string, unknown> = {
      orderId,
      itemId,
      paymentMethod: method,
      paymentType: method === 'PAY_ON_SITE' ? 'PAY_ON_SITE' : 'PREPAYMENT_ONLINE',
    };

    if (isTma && initDataRaw) {
      payload.initData = initDataRaw;
    } else {
      // Browser checkout requires customer contact details (PAY_ON_SITE and online prepayment alike)
      const trimmedName = customerName.trim();
      const trimmedPhone = customerPhone.trim();
      if (!trimmedName || !trimmedPhone) {
        setErrorMsg('Укажите имя и номер телефона для оформления заказа');
        setLoading(false);
        hapticFeedback.notificationOccurred('error');
        return;
      }
      payload.customerName = trimmedName;
      payload.customerPhone = trimmedPhone;
      payload.customerEmail = customerEmail.trim() || null;
    }

    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to initialize payment');
      }

      const data = await res.json();
      hapticFeedback.notificationOccurred('success');
      setInvoiceResult(data as InvoiceResultData);
    } catch (err: unknown) {
      setErrorMsg(String(err));
      hapticFeedback.notificationOccurred('error');
    } finally {
      setLoading(false);
    }
  }

  if (invoiceResult) {
    if (invoiceResult.paymentMethod === 'PAY_ON_SITE') {
      return (
        <div className="bg-green-900/50 border border-green-500/50 rounded-2xl p-8 text-center space-y-4">
          <div className="text-4xl">✅</div>
          <h3 className="text-2xl font-bold text-green-400">
            Бронирование подтверждено (Оплата при визите)
          </h3>
          <p className="text-gray-300 text-sm">
            Заказ <strong>{invoiceResult.order?.orderNumber}</strong> зарегистрирован без предоплаты.
            Оплата ({priceFormatted}) производится на месте после оказания услуги.
          </p>
        </div>
      );
    }

    if (invoiceResult.deferredUntilStaffApproval) {
      return (
        <div className="bg-warning-surface/50 border border-warning/50 rounded-2xl p-8 text-center space-y-4">
          <div className="text-4xl">⏳</div>
          <h3 className="text-2xl font-bold text-warning">
            Ожидается подтверждение мастера (AFTER_STAFF_APPROVAL)
          </h3>
          <p className="text-gray-300 text-sm">
            Заявка <strong>{invoiceResult.order?.orderNumber}</strong> отправлена мастеру в Staff-бот.
            Как только мастер нажмёт «Принять», вам придёт счёт с 15-минутным окном на оплату.
          </p>
        </div>
      );
    }

    if (invoiceResult.paymentMethod === 'TELEGRAM_STARS') {
      return (
        <div className="bg-warning-surface/40 border border-warning/50 rounded-2xl p-8 text-center space-y-4">
          <div className="text-4xl">⭐</div>
          <h3 className="text-2xl font-bold text-warning">Telegram Stars Invoice Issued</h3>
          <p className="text-gray-300 text-sm">
            Invoice for order <strong>{invoiceResult.order?.orderNumber}</strong> has been generated.
          </p>
          <div className="py-4 font-mono text-xl font-bold text-white">
            Total: {invoiceResult.starsPrice?.toLocaleString()} Stars (XTR)
          </div>
          <p className="text-xs text-gray-400">
            Please complete the payment prompt inside your Telegram chat or app dialog.
          </p>
        </div>
      );
    }

    return (
      <div className="bg-purple-900/40 border border-purple-500/50 rounded-2xl p-8 text-center space-y-4">
        <div className="text-4xl">🌐</div>
        <h3 className="text-2xl font-bold text-purple-400">NOWPayments Crypto Invoice</h3>
        <p className="text-gray-300 text-sm">
          Pay securely in BTC, ETH, USDT, TON or 150+ other cryptocurrencies.
        </p>
        <div className="pt-4">
          <a
            href={invoiceResult.invoiceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block bg-purple-600 hover:bg-purple-500 text-white font-extrabold py-3.5 px-8 rounded-xl shadow-lg transition"
          >
            Open Hosted Invoice →
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-900/80 border border-gray-800 rounded-2xl p-8 shadow-2xl space-y-6">
      <div>
        <h2 className="text-2xl font-extrabold text-white mb-1">Способ оплаты</h2>
        <p className="text-sm text-gray-400">
          Заказ: <strong className="text-gray-200">{itemTitle}</strong> · Сумма:{' '}
          <strong className="text-white">{priceFormatted}</strong>
        </p>
        {prepaymentTiming === 'AFTER_STAFF_APPROVAL' && orderStatus === 'PENDING' && (
          <p className="text-xs text-warning mt-2">
            ℹ️ Включён режим оплаты после одобрения мастера (AFTER_STAFF_APPROVAL). При выборе онлайн-предоплаты счёт на 15 минут выставляется после подтверждения записи мастером.
          </p>
        )}
      </div>

      {errorMsg && (
        <div className="p-3 bg-error-surface/80 border border-error rounded-lg text-error text-xs">
          ⚠️ {errorMsg}
        </div>
      )}

      {!isTma && !orderId && (
        <div className="space-y-3 border-t border-b border-gray-800 py-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Full Name *</label>
            <input
              type="text"
              required
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="bg-gray-950 border border-gray-800 text-white px-3 py-2 rounded-lg w-full text-sm"
              placeholder="Alice Johnson"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Phone Number *</label>
            <input
              type="tel"
              required
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              className="bg-gray-950 border border-gray-800 text-white px-3 py-2 rounded-lg w-full text-sm"
              placeholder="+1 555 123 4567"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Email (Optional)</label>
            <input
              type="email"
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
              className="bg-gray-950 border border-gray-800 text-white px-3 py-2 rounded-lg w-full text-sm"
              placeholder="alice@example.com"
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 pt-2">
        {allowPayOnSite && (
          <button
            type="button"
            disabled={loading}
            onClick={() => handleSelectRail('PAY_ON_SITE')}
            className={`flex flex-col items-center justify-center p-5 rounded-xl border text-white font-bold transition ${
              defaultPaymentType === 'PAY_ON_SITE'
                ? 'border-green-500 bg-green-900/50 hover:bg-green-900/70'
                : 'border-green-700/50 bg-green-900/20 hover:bg-green-900/40'
            }`}
          >
            <span className="text-2xl mb-1">💵</span>
            <span className="text-base text-green-300">Оплата на месте (PAY_ON_SITE)</span>
            <span className="text-xs text-gray-400 font-normal mt-1">
              Без онлайн-предоплаты — наличными или картой при визите
            </span>
          </button>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button
            type="button"
            disabled={loading}
            onClick={() => handleSelectRail('TELEGRAM_STARS')}
            className="flex flex-col items-center justify-center p-6 rounded-xl border border-warning/50 bg-warning-surface/30 hover:bg-warning-surface/60 text-white font-bold transition group"
          >
            <span className="text-3xl mb-2 group-hover:scale-110 transition">⭐</span>
            <span className="text-base text-warning">Telegram Stars</span>
            <span className="text-xs text-gray-400 font-normal mt-1">
              {starsPrice ? `${starsPrice.toLocaleString()} XTR` : 'Digital in-app tokens'}
            </span>
          </button>

          <button
            type="button"
            disabled={loading}
            onClick={() => handleSelectRail('CRYPTO_GATEWAY')}
            className="flex flex-col items-center justify-center p-6 rounded-xl border border-purple-700/50 bg-purple-900/30 hover:bg-purple-900/60 text-white font-bold transition group"
          >
            <span className="text-3xl mb-2 group-hover:scale-110 transition">🪙</span>
            <span className="text-base text-purple-300">Crypto Gateway</span>
            <span className="text-xs text-gray-400 font-normal mt-1">BTC, TON, USDT, ETH</span>
          </button>
        </div>
      </div>

      <p className="text-center text-xs text-gray-500">
        Transactions are cryptographically verified and recorded on ledger.
      </p>
    </div>
  );
}
