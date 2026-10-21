'use client';

import React, { useState, useEffect } from 'react';
import { useTelegram } from '../tma/TelegramProvider';

export const FIXED_PRICE_DISCLAIMER =
  '💡 У нас фиксированный прайс. Запросы скидок, торга и бартера не рассматриваются и ведут к аннулированию записи и ограничению доступа';

interface AvailableSlot {
  startTime: string;
  endTime: string;
  totalDurationMin?: number;
}

interface HoldSuccessData {
  order: {
    id: string;
    orderNumber: string;
    status: string;
    paymentType: 'PAY_ON_SITE' | 'PREPAYMENT_ONLINE';
  };
  reservation: {
    id: string;
    holdExpiresAt: string;
  };
}

export function SlotGrid({
  itemId,
  itemIds,
  itemTitle,
  totalDurationMin = 60,
  allowPayOnSite = true,
}: {
  itemId?: string;
  itemIds?: string[];
  itemTitle: string;
  totalDurationMin?: number;
  allowPayOnSite?: boolean;
}) {
  const { isTma, initDataRaw, user, hapticFeedback } = useTelegram();

  const resolvedItemIds =
    itemIds && itemIds.length > 0 ? itemIds : itemId ? [itemId] : [];
  const itemIdsParam = resolvedItemIds.join(',');

  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });

  const [slots, setSlots] = useState<AvailableSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null);

  // Form states
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerNotes, setCustomerNotes] = useState('');
  const [customerTgUsername, setCustomerTgUsername] = useState('');
  const [hasWhatsApp, setHasWhatsApp] = useState(false);
  const [hasTelegram, setHasTelegram] = useState(false);
  const [paymentType, setPaymentType] = useState<'PAY_ON_SITE' | 'PREPAYMENT_ONLINE'>(
    allowPayOnSite ? 'PAY_ON_SITE' : 'PREPAYMENT_ONLINE'
  );

  // Lock status
  const [locking, setLocking] = useState(false);
  const [conflictError, setConflictError] = useState<string | null>(null);
  const [holdSuccess, setHoldSuccess] = useState<HoldSuccessData | null>(null);

  useEffect(() => {
    if (user?.first_name) {
      setCustomerName([user.first_name, user.last_name].filter(Boolean).join(' '));
    }
  }, [user]);

  useEffect(() => {
    async function fetchSlots() {
      if (!itemIdsParam) return;
      setLoadingSlots(true);
      setConflictError(null);
      setSelectedSlot(null);
      try {
        const res = await fetch(
          `/api/booking/slots?itemIds=${encodeURIComponent(itemIdsParam)}&date=${selectedDate}`
        );
        if (res.ok) {
          const data = await res.json();
          setSlots(data.slots || []);
        } else {
          setSlots([]);
        }
      } catch (err) {
        console.error('Failed to load slots', err);
        setSlots([]);
      } finally {
        setLoadingSlots(false);
      }
    }
    fetchSlots();
  }, [itemIdsParam, selectedDate]);

  async function handleLockSlot(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSlot) return;

    setLocking(true);
    setConflictError(null);

    const payload: Record<string, unknown> = {
      itemId: resolvedItemIds[0],
      itemIds: resolvedItemIds,
      startTime: selectedSlot.startTime,
      customerNotes: customerNotes.trim() || null,
      paymentType,
    };

    if (isTma && initDataRaw) {
      payload.initData = initDataRaw;
    } else {
      payload.customerName = customerName;
      payload.customerPhone = customerPhone;
      payload.customerEmail = customerEmail || null;
      const trimmedTgUsername = customerTgUsername.trim();
      if (trimmedTgUsername) {
        payload.customerTgUsername = trimmedTgUsername.startsWith('@')
          ? trimmedTgUsername.slice(1)
          : trimmedTgUsername;
      }
      payload.hasWhatsApp = hasWhatsApp;
      payload.hasTelegram = hasTelegram;
    }

    try {
      const res = await fetch('/api/booking/lock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.status === 403) {
        hapticFeedback.notificationOccurred('error');
        setConflictError('Access restricted: онлайн-запись для данного контакта ограничена.');
        return;
      }

      if (res.status === 409) {
        hapticFeedback.notificationOccurred('error');
        setConflictError(
          'Выбранное время только что занял другой клиент. Пожалуйста, выберите другое окно.'
        );
        setSelectedSlot(null);
        const reload = await fetch(
          `/api/booking/slots?itemIds=${encodeURIComponent(itemIdsParam)}&date=${selectedDate}`
        );
        if (reload.ok) {
          const data = await reload.json();
          setSlots(data.slots || []);
        }
        return;
      }

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to lock slot');
      }

      const data = await res.json();
      hapticFeedback.notificationOccurred('success');
      setHoldSuccess(data as HoldSuccessData);
    } catch (err: unknown) {
      setConflictError(String(err));
    } finally {
      setLocking(false);
    }
  }

  if (holdSuccess) {
    return (
      <div className="bg-emerald-950/60 border border-emerald-500/50 rounded-xl p-6 text-center space-y-3">
        <h3 className="text-2xl font-bold text-emerald-400">
          {holdSuccess.order.paymentType === 'PAY_ON_SITE'
            ? 'Заявка оформлена (Оплата при визите)!'
            : 'Слот забронирован на 15 минут!'}
        </h3>
        <p className="text-gray-300 text-sm">
          Заказ <strong>{holdSuccess.order.orderNumber}</strong> ({itemTitle}, {totalDurationMin} мин) передан мастеру.
        </p>
        <p className="text-xs text-gray-400 font-mono">
          Холд до: {new Date(holdSuccess.reservation.holdExpiresAt).toLocaleTimeString()}
        </p>
        <div className="pt-2">
          <a
            href={`/checkout?orderId=${holdSuccess.order.id}&paymentType=${holdSuccess.order.paymentType}`}
            className="inline-block bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 px-6 rounded-lg shadow-lg transition"
          >
            {holdSuccess.order.paymentType === 'PAY_ON_SITE'
              ? 'Подтвердить запись (Оплата на месте) →'
              : 'Перейти к оплате →'}
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {conflictError && (
        <div className="p-4 bg-rose-950/80 border border-rose-500 rounded-lg text-rose-200 text-sm">
          ⚠️ {conflictError}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Выберите дату ({itemTitle} · {totalDurationMin} мин, шаг сетки 30 мин):
        </label>
        <input
          type="date"
          value={selectedDate}
          min={new Date().toISOString().split('T')[0]}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="bg-gray-900 border border-gray-700 text-white px-4 py-2.5 rounded-lg w-full max-w-xs focus:ring-2 focus:ring-blue-500 focus:outline-none"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">
          Доступные непрерывные окна (шаг 30 мин):
        </label>
        {loadingSlots ? (
          <p className="text-sm text-gray-400">Загрузка свободных окон...</p>
        ) : slots.length === 0 ? (
          <p className="text-sm text-amber-400">
            Нет непрерывных окон длительностью {totalDurationMin} мин на эту дату. Попробуйте другой день.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {slots.map((s, idx) => {
              const startFormatted = new Date(s.startTime).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              });
              const endFormatted = new Date(s.endTime).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              });
              const isSelected = selectedSlot?.startTime === s.startTime;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setSelectedSlot(s);
                    hapticFeedback.impactOccurred('light');
                  }}
                  className={`py-2 px-3 rounded-lg border text-xs font-mono transition ${
                    isSelected
                      ? 'bg-blue-600 border-blue-400 text-white font-bold shadow-md'
                      : 'bg-gray-900 border-gray-800 text-gray-300 hover:border-gray-600'
                  }`}
                >
                  <div>{startFormatted}</div>
                  <div className="text-[10px] opacity-75">до {endFormatted}</div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {selectedSlot && (
        <form onSubmit={handleLockSlot} className="border-t border-gray-800 pt-6 space-y-4">
          <h4 className="text-lg font-semibold text-white">Детали записи и контакты:</h4>

          {!isTma && (
            <>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Имя *</label>
                <input
                  type="text"
                  required
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="bg-gray-900 border border-gray-700 text-white px-3 py-2 rounded-lg w-full text-sm"
                  placeholder="Иван Иванов"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Телефон (E.164) *</label>
                <input
                  type="tel"
                  required
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  className="bg-gray-900 border border-gray-700 text-white px-3 py-2 rounded-lg w-full text-sm"
                  placeholder="+7 999 123 4567"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-1">Email (опционально)</label>
                <input
                  type="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  className="bg-gray-900 border border-gray-700 text-white px-3 py-2 rounded-lg w-full text-sm"
                  placeholder="client@example.com"
                />
              </div>
              <div className="bg-gray-950/50 border border-gray-800 rounded-lg p-3 mt-3">
                <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-2">
                  Контакты для мастера
                </label>
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="checkbox"
                    checked={hasWhatsApp}
                    onChange={(e) => setHasWhatsApp(e.target.checked)}
                    className="rounded text-blue-500 focus:ring-blue-500"
                  />
                  <label className="text-xs text-gray-300 cursor-pointer">Есть WhatsApp по этому номеру</label>
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="checkbox"
                    checked={hasTelegram}
                    onChange={(e) => setHasTelegram(e.target.checked)}
                    className="rounded text-blue-500 focus:ring-blue-500"
                  />
                  <label className="text-xs text-gray-300 cursor-pointer">Есть Telegram</label>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Юзернейм в Telegram (опционально)</label>
                  <input
                    type="text"
                    value={customerTgUsername}
                    onChange={(e) => setCustomerTgUsername(e.target.value)}
                    className="bg-gray-900 border border-gray-700 text-white px-3 py-2 rounded-lg w-full text-sm"
                    placeholder="@username"
                  />
                </div>
              </div>
            </>
          )}

          {isTma && (
            <p className="text-xs text-emerald-400">
              ✓ Запись через Telegram Mini App как @{user?.username || user?.first_name || 'Telegram User'}
            </p>
          )}

          <div>
            <label className="block text-xs text-gray-400 mb-1">
              Пожелания к визиту (до 1000 символов)
            </label>
            <textarea
              maxLength={1000}
              rows={3}
              value={customerNotes}
              onChange={(e) => setCustomerNotes(e.target.value)}
              className="bg-gray-900 border border-gray-700 text-white px-3 py-2 rounded-lg w-full text-sm"
              placeholder="Укажите пожелания по услугам..."
            />
            <p className="text-xs text-amber-300/90 mt-1.5 bg-amber-950/40 border border-amber-800/50 rounded-lg p-2.5">
              {FIXED_PRICE_DISCLAIMER}
            </p>
          </div>

          <div className="space-y-2 pt-2">
            <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider">
              Способ оплаты:
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {allowPayOnSite && (
                <label
                  className={`flex items-center gap-2.5 p-3 rounded-lg border cursor-pointer text-sm ${
                    paymentType === 'PAY_ON_SITE'
                      ? 'bg-emerald-950/50 border-emerald-500 text-white font-semibold'
                      : 'bg-gray-900 border-gray-800 text-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="paymentType"
                    value="PAY_ON_SITE"
                    checked={paymentType === 'PAY_ON_SITE'}
                    onChange={() => setPaymentType('PAY_ON_SITE')}
                  />
                  <span>💵 Оплата при визите (на месте)</span>
                </label>
              )}

              <label
                className={`flex items-center gap-2.5 p-3 rounded-lg border cursor-pointer text-sm ${
                  paymentType === 'PREPAYMENT_ONLINE'
                    ? 'bg-blue-950/50 border-blue-500 text-white font-semibold'
                    : 'bg-gray-900 border-gray-800 text-gray-300'
                }`}
              >
                <input
                  type="radio"
                  name="paymentType"
                  value="PREPAYMENT_ONLINE"
                  checked={paymentType === 'PREPAYMENT_ONLINE'}
                  onChange={() => setPaymentType('PREPAYMENT_ONLINE')}
                />
                <span>💳 Онлайн-предоплата (Stars / Crypto)</span>
              </label>
            </div>
          </div>

          <button
            type="submit"
            disabled={locking}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold py-3 px-4 rounded-lg shadow-lg transition"
          >
            {locking
              ? 'Бронирование слота...'
              : `Забронировать окно (${new Date(selectedSlot.startTime).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })} · ${totalDurationMin} мин)`}
          </button>
        </form>
      )}
    </div>
  );
}
