import React from 'react';
import Link from 'next/link';

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
  const formattedPrice = (item.priceMinor / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: item.currency || 'USD',
  });

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/80 p-6 flex flex-col justify-between shadow-lg hover:border-purple-500/50 transition">
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-purple-400 bg-purple-900/60 px-2 py-0.5 rounded">
            {item.itemType}
          </span>
          {item.itemType === 'SERVICE' && item.durationMin && (
            <span className="text-xs text-gray-400 font-mono">
              ⏱ {item.durationMin} min
            </span>
          )}
          {item.itemType === 'PRODUCT' && item.stock !== null && (
            <span className="text-xs text-green-400 font-mono">
              📦 In stock: {item.stock}
            </span>
          )}
        </div>

        <h3 className="text-xl font-bold text-gray-100 mb-2">{item.title}</h3>
        <p className="text-sm text-gray-400 mb-4 line-clamp-3">{item.description}</p>
      </div>

      <div className="pt-4 border-t border-gray-800/80 mt-auto">
        <div className="flex items-baseline justify-between mb-4">
          <div>
            <span className="text-2xl font-extrabold text-white">{formattedPrice}</span>
            {item.starsPrice && (
              <span className="ml-2 text-xs font-bold text-warning">
                ⭐ {item.starsPrice.toLocaleString()} XTR
              </span>
            )}
          </div>
        </div>

        {item.itemType === 'SERVICE' ? (
          <Link
            href={`/book?itemId=${item.id}`}
            className="w-full block text-center bg-purple-600 hover:bg-purple-500 text-white font-medium py-2.5 px-4 rounded-lg transition"
          >
            Book Appointment
          </Link>
        ) : (
          <Link
            href={`/checkout?itemId=${item.id}`}
            className="w-full block text-center bg-green-600 hover:bg-green-500 text-white font-medium py-2.5 px-4 rounded-lg transition"
          >
            Buy Now
          </Link>
        )}
      </div>
    </div>
  );
}
