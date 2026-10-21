import { prisma } from '@/lib/db/prisma';
import { SlotGrid } from '@/components/booking/SlotGrid';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function BookPage(props: {
  searchParams: Promise<{ itemId?: string; itemIds?: string }>;
}) {
  const searchParams = await props.searchParams;
  const rawIds = searchParams.itemIds || searchParams.itemId;

  let requestedIds = rawIds
    ? rawIds
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean)
    : [];

  if (requestedIds.length === 0) {
    const defaultService = await prisma.item.findFirst({
      where: { itemType: 'SERVICE', isActive: true },
    });
    if (defaultService) {
      requestedIds = [defaultService.id];
    }
  }

  if (requestedIds.length === 0) {
    return notFound();
  }

  const items = await prisma.item.findMany({
    where: { id: { in: requestedIds }, itemType: 'SERVICE', isActive: true },
    select: {
      id: true,
      title: true,
      description: true,
      priceMinor: true,
      currency: true,
      durationMin: true,
    },
  });

  if (items.length === 0) {
    return notFound();
  }

  const settings = await prisma.shopSettings.findUnique({ where: { id: 1 } });

  const totalMinor = items.reduce((sum, i) => sum + i.priceMinor, 0);
  const totalDurationMin = items.reduce((sum, i) => sum + (i.durationMin || 0), 0);
  const currency = items[0].currency || 'USD';
  const combinedTitle = items.map((i) => i.title).join(' + ');

  const formattedPrice = (totalMinor / 100).toLocaleString('en-US', {
    style: 'currency',
    currency,
  });

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="border-b border-gray-800 pb-4">
        <span className="text-xs uppercase font-bold tracking-wider text-blue-400 bg-blue-950/50 px-2 py-0.5 rounded">
          Service Booking ({items.length} {items.length === 1 ? 'услуга' : 'усл.'})
        </span>
        <h1 className="text-2xl sm:text-3xl font-bold text-white mt-2">{combinedTitle}</h1>
        <div className="flex items-center gap-4 mt-3 text-sm font-mono text-gray-300">
          <span>⏱ Суммарное время: {totalDurationMin} минут</span>
          <span>💵 Стоимость: {formattedPrice}</span>
        </div>
      </div>

      <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-6 shadow-xl">
        <SlotGrid
          itemId={items[0].id}
          itemIds={items.map((i) => i.id)}
          itemTitle={combinedTitle}
          totalDurationMin={totalDurationMin}
          allowPayOnSite={settings?.allowPayOnSite ?? true}
        />
      </div>
    </div>
  );
}
