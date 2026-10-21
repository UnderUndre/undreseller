import { prisma } from '@/lib/db/prisma';
import { ItemCard, CatalogItem } from '@/components/catalog/ItemCard';
import { CartDrawer } from '@/components/catalog/CartDrawer';
import { shopConfig } from '@/config/shop.config';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const items = await prisma.item.findMany({
    where: { isActive: true },
    orderBy: { createdAt: 'desc' },
  });

  return (
    <div className="space-y-8 pb-24">
      <div className="text-center max-w-2xl mx-auto py-6">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight mb-3">
          {shopConfig.brandName}
        </h1>
        <p className="text-base text-gray-400">
          {shopConfig.tagline}
        </p>
      </div>

      <CartDrawer items={items as CatalogItem[]} />

      {items.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-gray-800 rounded-xl">
          <p className="text-gray-400">Catalog is currently empty. Run seed or check back later.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.map((item) => (
            <ItemCard key={item.id} item={item as CatalogItem} />
          ))}
        </div>
      )}
    </div>
  );
}
