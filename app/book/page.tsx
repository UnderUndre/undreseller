import { prisma } from '@/lib/db/prisma';
import { SlotGrid } from '@/components/booking/SlotGrid';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function BookPage(props: {
  searchParams: Promise<{ itemId?: string }>;
}) {
  const searchParams = await props.searchParams;
  let itemId = searchParams.itemId;

  // If itemId not passed, default to first available service
  if (!itemId) {
    const defaultService = await prisma.item.findFirst({
      where: { itemType: 'SERVICE', isActive: true },
    });
    if (defaultService) {
      itemId = defaultService.id;
    }
  }

  if (!itemId) {
    return notFound();
  }

  const item = await prisma.item.findUnique({
    where: { id: itemId },
    select: {
      id: true,
      title: true,
      description: true,
      priceMinor: true,
      currency: true,
      durationMin: true,
    },
  });

  if (!item) {
    return notFound();
  }

  const formattedPrice = (item.priceMinor / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: item.currency || 'USD',
  });

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="border-b border-gray-800 pb-4">
        <span className="text-xs uppercase font-bold tracking-wider text-blue-400 bg-blue-950/50 px-2 py-0.5 rounded">
          Service Booking
        </span>
        <h1 className="text-2xl sm:text-3xl font-bold text-white mt-2">{item.title}</h1>
        <p className="text-gray-400 text-sm mt-1">{item.description}</p>
        <div className="flex items-center gap-4 mt-3 text-sm font-mono text-gray-300">
          <span>⏱ Duration: {item.durationMin} minutes</span>
          <span>💵 Price: {formattedPrice}</span>
        </div>
      </div>

      <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-6 shadow-xl">
        <SlotGrid itemId={item.id} itemTitle={item.title} />
      </div>
    </div>
  );
}
