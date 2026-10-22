#!/usr/bin/env ts-node

/**
 * Idempotent Resource & Currency Backfill + Reconciliation Script (T011)
 * Compliance: NIST SP 800-218 SSDF & ISO/IEC/IEEE 12207:2017
 * Non-Functional Requirement: NFR-305
 */

import { prisma } from '../lib/db/prisma';
import { CURRENCY_REGISTRY } from '../config/currency-registry';

export interface BackfillSummary {
  resourcesCreatedOrVerified: number;
  currenciesSeeded: number;
  servicesReconciled: number;
  unreconciledOrphans: number;
}

export async function runBackfillAndReconciliation(): Promise<BackfillSummary> {
  console.log('='.repeat(70));
  console.log('🔄  IDEMPOTENT BOOKING TEMPLATE BACKFILL & RECONCILIATION (T011)');
  console.log('='.repeat(70));

  let resourcesCreatedOrVerified = 0;
  let currenciesSeeded = 0;
  let servicesReconciled = 0;

  // 1. Seed ISO 4217 CurrencyMetadata
  console.log('1. Seeding / reconciling CurrencyMetadata registry...');
  for (const [code, meta] of Object.entries(CURRENCY_REGISTRY)) {
    await prisma.currencyMetadata.upsert({
      where: { code },
      update: {
        minorUnit: meta.minorUnit,
        symbol: meta.symbol,
        active: meta.active,
      },
      create: {
        code,
        minorUnit: meta.minorUnit,
        symbol: meta.symbol,
        active: meta.active,
      },
    });
    currenciesSeeded++;
  }
  console.log(`✓ Reconciled ${currenciesSeeded} CurrencyMetadata records.`);

  // 2. Scan distinct resourceIds across WeeklyHours and SlotReservation
  console.log('2. Scanning distinct resourceId values in WeeklyHours and SlotReservation...');
  const distinctWeeklyHours = await prisma.weeklyHours.findMany({
    select: { resourceId: true },
    distinct: ['resourceId'],
  });

  const distinctReservations = await prisma.slotReservation.findMany({
    select: { resourceId: true },
    distinct: ['resourceId'],
  });

  const allResourceIds = new Set<string>(['default_master']);
  for (const row of distinctWeeklyHours) {
    if (row.resourceId) allResourceIds.add(row.resourceId);
  }
  for (const row of distinctReservations) {
    if (row.resourceId) allResourceIds.add(row.resourceId);
  }

  // 3. Upsert Resource rows idempotently
  console.log(`3. Upserting ${allResourceIds.size} distinct Resource records...`);
  for (const resId of allResourceIds) {
    await prisma.resource.upsert({
      where: { id: resId },
      update: { active: true },
      create: {
        id: resId,
        name: resId === 'default_master' ? 'Default Master' : `Resource ${resId}`,
        kind: 'STAFF',
        active: true,
      },
    });
    resourcesCreatedOrVerified++;
  }
  console.log(`✓ Created or verified ${resourcesCreatedOrVerified} Resource records.`);

  // 4. Reconcile existing services (Item where itemType = SERVICE)
  console.log('4. Reconciling Item services with default Resource associations...');
  const services = await prisma.item.findMany({
    where: { itemType: 'SERVICE' },
  });

  for (const service of services) {
    // Ensure weekly hours exist for default_master if none are associated
    const existingHours = await prisma.weeklyHours.findFirst({
      where: { itemId: service.id },
    });

    if (!existingHours) {
      // Create standard Monday-Friday 09:00 - 18:00 default hours
      for (let weekday = 1; weekday <= 5; weekday++) {
        await prisma.weeklyHours.create({
          data: {
            itemId: service.id,
            resourceId: 'default_master',
            weekday,
            startMin: 9 * 60,
            endMin: 18 * 60,
          },
        });
      }
    }
    servicesReconciled++;
  }
  console.log(`✓ Reconciled ${servicesReconciled} services.`);

  // 5. Check for any orphan reservations referencing missing resources
  console.log('5. Integrity check: scanning for orphaned reservations...');
  const activeResources = await prisma.resource.findMany({ select: { id: true } });
  const activeResourceSet = new Set(activeResources.map((r) => r.id));

  const allResv = await prisma.slotReservation.findMany({
    select: { id: true, resourceId: true },
  });

  let unreconciledOrphans = 0;
  for (const r of allResv) {
    if (!activeResourceSet.has(r.resourceId)) {
      unreconciledOrphans++;
      console.warn(`[ORPHAN_RESOURCE_ID] Reservation ${r.id} references missing resource ${r.resourceId}`);
    }
  }

  console.log('='.repeat(70));
  console.log('✓ BACKFILL SUMMARY:');
  console.log(`  - Currencies Seeded:             ${currenciesSeeded}`);
  console.log(`  - Resources Verified:            ${resourcesCreatedOrVerified}`);
  console.log(`  - Services Reconciled:           ${servicesReconciled}`);
  console.log(`  - Unreconciled Orphans:          ${unreconciledOrphans}`);
  console.log('='.repeat(70));

  return {
    currenciesSeeded,
    resourcesCreatedOrVerified,
    servicesReconciled,
    unreconciledOrphans,
  };
}

if (require.main === module) {
  runBackfillAndReconciliation()
    .catch((err) => {
      console.error('❌ Backfill failed:', err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
