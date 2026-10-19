'use client';

import React, { useState } from 'react';
import { useTelegram } from '../tma/TelegramProvider';

interface InvoiceResultData {
  paymentMethod: 'TELEGRAM_STARS' | 'CRYPTO_GATEWAY';
  order?: {
    orderNumber: string;
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
}: {
  orderId?: string;
  itemId?: string;
  itemTitle: string;
  priceFormatted: string;
  starsPrice?: number | null;
}) {
  const { isTma, initDataRaw, user, hapticFeedback } = useTelegram();

  const [customerName, setCustomerName] = useState(user?.first_name || '');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');

  const [loading, setLoading] = useState(false);
  const [invoiceResult, setInvoiceResult] = useState<InvoiceResultData | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleSelectRail(method: 'TELEGRAM_STARS' | 'CRYPTO_GATEWAY') {
    setLoading(true);
    setErrorMsg(null);
    hapticFeedback.impactOccurred('medium');

    const payload: Record<string, unknown> = {
      orderId,
      itemId,
      paymentMethod: method,
    };

    if (isTma && initDataRaw) {
      payload.initData = initDataRaw;
    } else {
      payload.customerName = customerName;
      payload.customerPhone = customerPhone;
      payload.customerEmail = customerEmail || null;
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
    if (invoiceResult.paymentMethod === 'TELEGRAM_STARS') {
      return (
        <div className="bg-yellow-950/40 border border-yellow-500/50 rounded-2xl p-8 text-center space-y-4">
          <div className="text-4xl">⭐</div>
          <h3 className="text-2xl font-bold text-yellow-400">Telegram Stars Invoice Issued</h3>
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
      <div className="bg-blue-950/40 border border-blue-500/50 rounded-2xl p-8 text-center space-y-4">
        <div className="text-4xl">🌐</div>
        <h3 className="text-2xl font-bold text-blue-400">NOWPayments Crypto Invoice</h3>
        <p className="text-gray-300 text-sm">
          Pay securely in BTC, ETH, USDT, TON or 150+ other cryptocurrencies.
        </p>
        <div className="pt-4">
          <a
            href={invoiceResult.invoiceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block bg-blue-600 hover:bg-blue-500 text-white font-extrabold py-3.5 px-8 rounded-xl shadow-lg transition"
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
        <h2 className="text-2xl font-extrabold text-white mb-1">Select Payment Rail</h2>
        <p className="text-sm text-gray-400">
          Purchasing: <strong className="text-gray-200">{itemTitle}</strong> for{' '}
          <strong className="text-white">{priceFormatted}</strong>
        </p>
      </div>

      {errorMsg && (
        <div className="p-3 bg-rose-950/80 border border-rose-500 rounded-lg text-rose-200 text-xs">
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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
        {/* Action 1: Telegram Stars */}
        <button
          type="button"
          disabled={loading}
          onClick={() => handleSelectRail('TELEGRAM_STARS')}
          className="flex flex-col items-center justify-center p-6 rounded-xl border border-yellow-700/50 bg-yellow-950/30 hover:bg-yellow-950/60 text-white font-bold transition group"
        >
          <span className="text-3xl mb-2 group-hover:scale-110 transition">⭐</span>
          <span className="text-base text-yellow-300">Telegram Stars</span>
          <span className="text-xs text-gray-400 font-normal mt-1">
            {starsPrice ? `${starsPrice.toLocaleString()} XTR` : 'Digital in-app tokens'}
          </span>
        </button>

        {/* Action 2: NOWPayments Crypto */}
        <button
          type="button"
          disabled={loading}
          onClick={() => handleSelectRail('CRYPTO_GATEWAY')}
          className="flex flex-col items-center justify-center p-6 rounded-xl border border-emerald-700/50 bg-emerald-950/30 hover:bg-emerald-950/60 text-white font-bold transition group"
        >
          <span className="text-3xl mb-2 group-hover:scale-110 transition">🪙</span>
          <span className="text-base text-emerald-300">Crypto Gateway</span>
          <span className="text-xs text-gray-400 font-normal mt-1">BTC, TON, USDT, ETH</span>
        </button>
      </div>

      <p className="text-center text-xs text-gray-500">
        Transactions are cryptographically verified and recorded on ledger.
      </p>
    </div>
  );
}
