import { PrismaClient, ItemType } from '@prisma/client';
import * as fs from 'node:fs';
import * as path from 'node:path';

function loadEnvFileIfNeeded(): void {
  if (process.env.DATABASE_URL) {
    return;
  }
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) {
    return;
  }
  const content = fs.readFileSync(envPath, 'utf-8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    let val = line.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}

loadEnvFileIfNeeded();

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

  // 2. Service Item 1 (stock is null, durationMin is positive)
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
  console.log(`[seed] Created/updated Service 1: ${service.slug}`);

  // 2b. Service Item 2 (Premium Service, 90 min)
  const premiumService = await prisma.item.upsert({
    where: { slug: 'premium-consulting-session' },
    update: {
      title: 'Premium Consulting Session',
      description: 'Extended 90-minute one-on-one consulting session for technical architecture, code review, and system design optimization.',
      priceMinor: 15000, // $150.00
      starsPrice: 7500, // 7,500 Stars
      currency: 'USD',
      itemType: ItemType.SERVICE,
      stock: null,
      durationMin: 90,
      isActive: true,
    },
    create: {
      slug: 'premium-consulting-session',
      title: 'Premium Consulting Session',
      description: 'Extended 90-minute one-on-one consulting session for technical architecture, code review, and system design optimization.',
      priceMinor: 15000,
      starsPrice: 7500,
      currency: 'USD',
      itemType: ItemType.SERVICE,
      stock: null,
      durationMin: 90,
      isActive: true,
    },
  });
  console.log(`[seed] Created/updated Service 2: ${premiumService.slug}`);

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

  // 4. WeeklyHours for Service Items (Weekdays 1..5)
  // Clear existing hours
  await prisma.weeklyHours.deleteMany({
    where: { itemId: { in: [service.id, premiumService.id] } },
  });

  // Service 1: 09:00-18:00 with lunch break 13:00-14:00
  const hoursData1 = [1, 2, 3, 4, 5].map((weekday) => ({
    itemId: service.id,
    weekday,
    startMin: 9 * 60,
    endMin: 22 * 60,
    breakStartMin: 13 * 60,
    breakEndMin: 14 * 60,
  }));

  // Service 2: 09:00-22:00 with lunch break 13:00-14:00 (extended hours)
  const hoursData2 = [1, 2, 3, 4, 5].map((weekday) => ({
    itemId: premiumService.id,
    weekday,
    startMin: 9 * 60,
    endMin: 22 * 60, // Extended to 22:00 (10 PM)
    breakStartMin: 13 * 60,
    breakEndMin: 14 * 60,
  }));

  const allHours = [...hoursData1, ...hoursData2];
  await prisma.weeklyHours.createMany({
    data: allHours,
  });
  console.log(`[seed] Created ${allHours.length} WeeklyHours records`);

  console.log('[seed] Seeding completed successfully.');
}

function isMainModule(): boolean {
  if (typeof require !== 'undefined' && typeof module !== 'undefined') {
    return require.main === module;
  }
  return Boolean(process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('/scripts/seed.ts'));
}

if (isMainModule()) {
  seed()
    .catch((err) => {
      console.error('[seed] Error seeding database:', err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
