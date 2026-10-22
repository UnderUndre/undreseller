import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db/prisma';
import { SlotGrid } from '@/components/booking/SlotGrid';
import { shopConfig } from '@/config/shop.config';

export const dynamic = 'force-dynamic';

export default async function BookPage(props: {
  searchParams: Promise<{ serviceId?: string; itemId?: string; performerSlug?: string }>;
}) {
  const searchParams = await props.searchParams;
  const targetId = searchParams.serviceId || searchParams.itemId;

  let service;
  if (targetId) {
    service = await prisma.item.findFirst({
      where: { id: targetId, itemType: 'SERVICE', isActive: true },
    });
  } else {
    service = await prisma.item.findFirst({
      where: { itemType: 'SERVICE', isActive: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  if (!service) {
    return notFound();
  }

  const settings = await prisma.shopSettings.findUnique({ where: { id: 1 } });
  const currency = settings?.currency || 'USD';

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 pb-24">
      <SlotGrid
        service={{
          id: service.id,
          title: service.title,
          description: service.description,
          durationMin: service.durationMin || 60,
          inCallEnabled: service.inCallEnabled,
          outCallEnabled: service.outCallEnabled,
          priceMinor: service.priceMinor,
          outCallPriceMinor: service.outCallPriceMinor,
          outCallTravelFeeMinor: service.outCallTravelFeeMinor,
          currency,
        }}
        currency={currency}
        currencyConfirmed={settings?.currencyConfirmed ?? false}
        performerSlug={searchParams.performerSlug}
        businessServiceAddress={settings?.businessServiceAddress}
        outCallCoverageDescription={settings?.outCallCoverageDescription}
      />
    </div>
  );
}
