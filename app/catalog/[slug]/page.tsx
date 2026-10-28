import { prisma } from '@/lib/db/prisma';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const item = await prisma.item.findUnique({
    where: { slug, isActive: true },
    select: { title: true, description: true },
  });

  if (!item) {
    return { title: (await getTranslations('web.item'))('itemNotFound') };
  }

  return {
    title: item.title,
    description: item.description,
  };
}

export default async function CatalogItemPage({ params }: Props) {
  const { slug } = await params;
  const item = await prisma.item.findUnique({
    where: { slug, isActive: true },
  });

  if (!item) {
    return notFound();
  }

  const formattedPrice = (item.priceMinor / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: item.currency || 'USD',
  });

  // Schema.org JSON-LD with XSS sanitization (< replaced with \u003c)
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': item.itemType === 'SERVICE' ? 'Service' : 'Product',
    name: item.title,
    description: item.description,
    offers: {
      '@type': 'Offer',
      price: (item.priceMinor / 100).toFixed(2),
      priceCurrency: item.currency || 'USD',
      availability:
        item.itemType === 'PRODUCT' && item.stock !== null && item.stock <= 0
          ? 'https://schema.org/OutOfStock'
          : 'https://schema.org/InStock',
    },
  };

  const safeJsonLdString = JSON.stringify(jsonLd).replace(/</g, '\\u003c');

  // T040 (FR-411): chrome labels only; item.title/description stay authored (FR-414).
  const t = await getTranslations('web.item');

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* Schema.org Structured Data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLdString }}
      />

      <div className="bg-base-200/60 border border-base-300 rounded-2xl p-8 shadow-xl">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-xs uppercase font-extrabold tracking-wider text-purple-400 bg-purple-900 px-2.5 py-1 rounded">
            {item.itemType}
          </span>
          {item.itemType === 'SERVICE' && item.durationMin && (
            <span className="text-xs text-base-content/60 font-mono">
              {t('minDuration', { minutes: item.durationMin })}
            </span>
          )}
          {item.itemType === 'PRODUCT' && item.stock !== null && (
            <span className="text-xs text-green-400 font-mono">
              {t('stock', { stock: item.stock })}
            </span>
          )}
        </div>

        <h1 className="text-3xl font-extrabold text-base-content mb-4">{item.title}</h1>
        <p className="text-base-content/80 text-base leading-relaxed mb-6 whitespace-pre-line">
          {item.description}
        </p>

        <div className="flex items-baseline gap-4 py-6 border-t border-b border-base-300 my-6">
          <span className="text-3xl font-black text-base-content">{formattedPrice}</span>
          {item.starsPrice && (
            <span className="text-sm font-bold text-warning bg-warning-surface/40 px-3 py-1 rounded-full border border-warning/50">
              {t('starsPrice', { count: item.starsPrice.toLocaleString() })}
            </span>
          )}
        </div>

        <div className="flex gap-4">
          {item.itemType === 'SERVICE' ? (
            <Link
              href={`/book?itemId=${item.id}`}
              className="w-full text-center bg-purple-600 hover:bg-purple-500 text-white font-bold py-3.5 px-6 rounded-xl shadow-lg transition"
            >
              {t('selectTimeBook')}
            </Link>
          ) : (
            <Link
              href={`/checkout?itemId=${item.id}`}
              className="w-full text-center bg-green-600 hover:bg-green-500 text-white font-bold py-3.5 px-6 rounded-xl shadow-lg transition"
            >
              {t('buyCryptoOrStars')}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
