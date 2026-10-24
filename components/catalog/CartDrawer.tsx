'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { CatalogItem } from './ItemCard';

export const MAX_CART_SERVICES = 10;

export function CartDrawer({ items }: { items: CatalogItem[] }) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  const serviceItems = useMemo(
    () => items.filter((item) => item.itemType === 'SERVICE'),
    [items]
  );

  const selectedServices = useMemo(
    () =>
      selectedIds
        .map((id) => serviceItems.find((s) => s.id === id))
        .filter((s): s is CatalogItem => Boolean(s)),
    [selectedIds, serviceItems]
  );

  const totalDurationMin = useMemo(
    () => selectedServices.reduce((acc, s) => acc + (s.durationMin || 0), 0),
    [selectedServices]
  );

  const totalMinor = useMemo(
    () => selectedServices.reduce((acc, s) => acc + s.priceMinor, 0),
    [selectedServices]
  );

  const currency = selectedServices[0]?.currency || serviceItems[0]?.currency || 'USD';
  const formattedTotal = (totalMinor / 100).toLocaleString('en-US', {
    style: 'currency',
    currency,
  });

  function toggleService(itemId: string) {
    setSelectedIds((prev) => {
      if (prev.includes(itemId)) {
        return prev.filter((id) => id !== itemId);
      }
      if (prev.length >= MAX_CART_SERVICES) {
        return prev;
      }
      return [...prev, itemId];
    });
  }

  if (serviceItems.length === 0) {
    return null;
  }

  const bookHref = `/book?itemIds=${encodeURIComponent(selectedIds.join(','))}`;

  return (
    <div className="space-y-4">
      <div className="bg-gray-900/70 border border-gray-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-bold text-white">Комплексная запись (Корзина услуг)</h2>
            <p className="text-xs text-gray-400">
              Выберите до {MAX_CART_SERVICES} услуг для бронирования единого непрерывного окна с шагом 30 минут
            </p>
          </div>
          {selectedIds.length > 0 && (
            <button
              type="button"
              onClick={() => setSelectedIds([])}
              className="text-xs text-error hover:text-error underline"
            >
              Очистить ({selectedIds.length})
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {serviceItems.map((srv) => {
            const isSelected = selectedIds.includes(srv.id);
            const priceStr = (srv.priceMinor / 100).toLocaleString('en-US', {
              style: 'currency',
              currency: srv.currency || 'USD',
            });

            return (
              <button
                key={srv.id}
                type="button"
                onClick={() => toggleService(srv.id)}
                className={`text-left p-3.5 rounded-lg border transition flex items-center justify-between ${
                  isSelected
                    ? 'bg-purple-900/60 border-purple-500 text-white'
                    : 'bg-gray-950/60 border-gray-800 text-gray-300 hover:border-gray-700'
                }`}
              >
                <div className="pr-2">
                  <div className="font-semibold text-sm">{srv.title}</div>
                  <div className="text-xs text-gray-400 font-mono mt-0.5">
                    ⏱ {srv.durationMin} мин · {priceStr}
                  </div>
                </div>
                <span
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    isSelected ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400'
                  }`}
                >
                  {isSelected ? '✓' : '+'}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {selectedServices.length > 0 && (
        <div className="fixed bottom-4 left-4 right-4 max-w-3xl mx-auto z-50 bg-gray-900/95 backdrop-blur border border-purple-500/60 rounded-2xl p-4 shadow-2xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="bg-purple-600 text-white text-xs font-bold px-2.5 py-0.5 rounded-full">
                  {selectedServices.length} усл.
                </span>
                <span className="text-white font-bold text-base">{formattedTotal}</span>
                <span className="text-xs text-purple-300 font-mono">
                  · ⏱ {totalDurationMin} мин подряд
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen((v) => !v)}
                className="text-xs text-gray-400 hover:text-gray-200 mt-1 underline"
              >
                {isOpen ? 'Скрыть состав корзины ▲' : 'Показать состав корзины ▼'}
              </button>
            </div>

            <Link
              href={bookHref}
              className="bg-purple-600 hover:bg-purple-500 text-white font-bold py-2.5 px-6 rounded-xl text-center shadow-lg transition text-sm"
            >
              Выбрать время ({totalDurationMin} мин) →
            </Link>
          </div>

          {isOpen && (
            <div className="mt-3 pt-3 border-t border-gray-800 space-y-1.5 max-h-48 overflow-y-auto">
              {selectedServices.map((srv) => (
                <div key={srv.id} className="flex items-center justify-between text-xs text-gray-300">
                  <span>
                    {srv.title} ({srv.durationMin} мин)
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleService(srv.id)}
                    className="text-error hover:text-error ml-2"
                  >
                    Удалить
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
