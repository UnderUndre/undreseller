import { PrismaClient, ItemType } from '@prisma/client';

const prisma = new PrismaClient();

export async function seed(): Promise<void> {
  console.log('[seed] Seeding initial demo data...');

  // 1. ShopSettings (singleton id = 1)
  const settings = await prisma.shopSettings.upsert({
    where: { id: 1 },
    update: {
      currency: 'USD',
      greeting: '👋 Welcome to UnderUndre Sovereign Store! Book an engineering consultation or purchase our turnkey starter.',
      whatsappTemplateName: 'order_status_update',
    },
    create: {
      id: 1,
      currency: 'USD',
      greeting: '👋 Welcome to UnderUndre Sovereign Store! Book an engineering consultation or purchase our turnkey starter.',
      whatsappTemplateName: 'order_status_update',
    },
  });
  console.log(`[seed] Created/updated ShopSettings: ${settings.id}`);

  // 2. Service Item (stock is null, durationMin is positive)
  const service = await prisma.item.upsert({
    where: { slug: 'sovereign-architecture-audit' },
    update: {
      title: 'Sovereign Architecture Audit',
      description: '1-on-1 technical systems and sovereign FOSS stack audit with 3x certified Salesforce & full-stack architect.',
      priceMinor: 35000, // $350.00 Tripwire
      starsPrice: 17500, // 17,500 Stars
      currency: 'USD',
      itemType: ItemType.SERVICE,
      stock: null,
      durationMin: 60,
      isActive: true,
    },
    create: {
      slug: 'sovereign-architecture-audit',
      title: 'Sovereign Architecture Audit',
      description: '1-on-1 technical systems and sovereign FOSS stack audit with 3x certified Salesforce & full-stack architect.',
      priceMinor: 35000,
      starsPrice: 17500,
      currency: 'USD',
      itemType: ItemType.SERVICE,
      stock: null,
      durationMin: 60,
      isActive: true,
    },
  });
  console.log(`[seed] Created/updated Service: ${service.slug}`);

  // 3. Product Item (stock >= 0, durationMin is null)
  const product = await prisma.item.upsert({
    where: { slug: 'modular-commerce-template' },
    update: {
      title: 'Modular Commerce Starter v1',
      description: 'Turnkey self-hosted modular e-commerce template with Telegram Mini App, WhatsApp autoresponder, and local AI RAG.',
      priceMinor: 490000, // $4,900.00 Sprint B HERO
      starsPrice: 245000,
      currency: 'USD',
      itemType: ItemType.PRODUCT,
      stock: 20,
      durationMin: null,
      isActive: true,
    },
    create: {
      slug: 'modular-commerce-template',
      title: 'Modular Commerce Starter v1',
      description: 'Turnkey self-hosted modular e-commerce template with Telegram Mini App, WhatsApp autoresponder, and local AI RAG.',
      priceMinor: 490000,
      starsPrice: 245000,
      currency: 'USD',
      itemType: ItemType.PRODUCT,
      stock: 20,
      durationMin: null,
      isActive: true,
    },
  });
  console.log(`[seed] Created/updated Product: ${product.slug}`);

  // 4. WeeklyHours for Service Item (Weekdays 1..5, 09:00 to 18:00, lunch break 13:00 to 14:00)
  await prisma.weeklyHours.deleteMany({
    where: { itemId: service.id },
  });

  const hoursData = [1, 2, 3, 4, 5].map((weekday) => ({
    itemId: service.id,
    weekday,
    startMin: 9 * 60,
    endMin: 18 * 60,
    breakStartMin: 13 * 60,
    breakEndMin: 14 * 60,
  }));

  await prisma.weeklyHours.createMany({
    data: hoursData,
  });
  console.log(`[seed] Created ${hoursData.length} WeeklyHours records for ${service.slug}`);

  console.log('[seed] Seeding completed successfully.');
}

if (require.main === module) {
  seed()
    .catch((err) => {
      console.error('[seed] Error seeding database:', err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
