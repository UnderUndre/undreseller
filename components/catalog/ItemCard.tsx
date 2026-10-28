import React from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

export interface CatalogItem {
  id: string;
  slug: string;
  title: string;
  description: string;
  priceMinor: number;
  starsPrice?: number | null;
  currency: string;
  imageUrl?: string | null;
  itemType: 'PRODUCT' | 'SERVICE';
  stock?: number | null;
  durationMin?: number | null;
}

export function ItemCard({ item }: { item: CatalogItem }) {
  // T040 (FR-411): chrome labels only — item.title/description stay authored (FR-414).
  const t = useTranslations('web.item');
  const formattedPrice = (item.priceMinor / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: item.currency || 'USD',
  });

  return (
    <div className="rounded-xl border border-base-300 bg-base-200/80 p-6 flex flex-col justify-between shadow-lg hover:border-purple-500/50 transition">
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-purple-400 bg-purple-900/60 px-2 py-0.5 rounded">
            {item.itemType}
          </span>
          {item.itemType === 'SERVICE' && item.durationMin && (
            <span className="text-xs text-base-content/60 font-mono">
              {t('minutes', { minutes: item.durationMin ?? 0 })}
            </span>
          )}
          {item.itemType === 'PRODUCT' && item.stock !== null && (
            <span className="text-xs text-green-400 font-mono">
              {t('inStock', { stock: item.stock ?? 0 })}
            </span>
          )}
        </div>

        <h3 className="text-xl font-bold text-base-content mb-2">{item.title}</h3>
        <p className="text-sm text-base-content/60 mb-4 line-clamp-3">{item.description}</p>
      </div>

      <div className="pt-4 border-t border-base-300/80 mt-auto">
        <div className="flex items-baseline justify-between mb-4">
          <div>
            <span className="text-2xl font-extrabold text-base-content">{formattedPrice}</span>
            {item.starsPrice && (
              <span className="ml-2 inline-flex items-center gap-1 text-xs font-bold text-warning bg-warning/10 px-2 py-0.5 rounded-md border border-warning/20">
                <svg className="w-3 h-3 text-warning fill-current" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                </svg>
                <span>{item.starsPrice.toLocaleString()} XTR</span>
              </span>
            )}
          </div>
        </div>

        {item.itemType === 'SERVICE' ? (
          <Link
            href={`/book?itemId=${item.id}`}
            className="w-full block text-center bg-purple-600 hover:bg-purple-500 text-white font-semibold py-2.5 px-4 rounded-xl text-sm transition-all shadow-sm active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/50"
          >
            {t('bookAppointment')}
          </Link>
        ) : (
          <Link
            href={`/checkout?itemId=${item.id}`}
            className="w-full block text-center bg-green-600 hover:bg-green-500 text-white font-semibold py-2.5 px-4 rounded-xl text-sm transition-all shadow-sm active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500/50"
          >
            {t('buyNow')}
          </Link>
        )}
      </div>
    </div>
  );
}
