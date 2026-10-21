import { prisma } from '@/lib/db/prisma';
import { notFound } from 'next/navigation';
import { CheckoutModal } from '@/components/checkout/CheckoutModal';

export const dynamic = 'force-dynamic';

export default async function CheckoutPage(props: {
  searchParams: Promise<{
    itemId?: string;
    orderId?: string;
    paymentType?: 'PAY_ON_SITE' | 'PREPAYMENT_ONLINE';
  }>;
}) {
  const searchParams = await props.searchParams;
  const { itemId, orderId, paymentType } = searchParams;

  if (!itemId && !orderId) {
    return notFound();
  }

  const settings = await prisma.shopSettings.findUnique({ where: { id: 1 } });

  let title = 'Checkout Order';
  let priceFormatted = '$0.00';
  let starsPrice: number | null = null;
  let resolvedPaymentType: 'PAY_ON_SITE' | 'PREPAYMENT_ONLINE' =
    paymentType || 'PREPAYMENT_ONLINE';
  let orderStatus = 'PENDING';

  if (orderId) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: { include: { item: true } },
      },
    });

    if (
      !order ||
      (order.status !== 'PENDING' && order.status !== 'AWAITING_PAYMENT')
    ) {
      return notFound();
    }

    title = `Order #${order.orderNumber}`;
    priceFormatted = (order.totalMinor / 100).toLocaleString('en-US', {
      style: 'currency',
      currency: order.currency,
    });
    starsPrice = Math.round(order.totalMinor / 2);
    resolvedPaymentType =
      paymentType || (order.paymentType as 'PAY_ON_SITE' | 'PREPAYMENT_ONLINE') || 'PAY_ON_SITE';
    orderStatus = order.status;
  } else if (itemId) {
    const item = await prisma.item.findUnique({
      where: { id: itemId },
    });

    if (!item || !item.isActive) {
      return notFound();
    }

    title = item.title;
    priceFormatted = (item.priceMinor / 100).toLocaleString('en-US', {
      style: 'currency',
      currency: item.currency,
    });
    starsPrice = item.starsPrice;
  }

  return (
    <div className="max-w-xl mx-auto py-6">
      <CheckoutModal
        orderId={orderId}
        itemId={itemId}
        itemTitle={title}
        priceFormatted={priceFormatted}
        starsPrice={starsPrice}
        defaultPaymentType={resolvedPaymentType}
        prepaymentTiming={
          (settings?.prepaymentTiming as 'IMMEDIATE' | 'AFTER_STAFF_APPROVAL') || 'IMMEDIATE'
        }
        allowPayOnSite={settings?.allowPayOnSite ?? true}
        orderStatus={orderStatus}
      />
    </div>
  );
}
