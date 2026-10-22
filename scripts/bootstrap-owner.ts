#!/usr/bin/env ts-node

/**
 * Idempotent Initial OWNER Bootstrap Script (T008)
 * Standard Compliance: NIST SP 800-218 SSDF & ISO/IEC/IEEE 12207:2017
 * Requirements: FR-325a, FR-325b, NFR-305
 */

import { randomBytes, scryptSync } from 'node:crypto';
import { prisma } from '../lib/db/prisma';
import { CURRENCY_REGISTRY } from '../config/currency-registry';
import { emitAuditEvent } from '../lib/security/staffAuth';

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = scryptSync(password, salt, 64);
  return `${salt}:${derivedKey.toString('hex')}`;
}

async function main() {
  console.log('='.repeat(70));
  console.log('🛡️  IDEMPOTENT STAFF OWNER BOOTSTRAP & SEED');
  console.log('='.repeat(70));

  // 1. Seed CurrencyMetadata
  console.log('1. Seeding CurrencyMetadata registry...');
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
  }
  console.log(`✓ Seeded ${Object.keys(CURRENCY_REGISTRY).length} currencies in CurrencyMetadata.`);

  // 2. Ensure default_master Resource exists
  console.log('2. Ensuring default_master Resource exists...');
  await prisma.resource.upsert({
    where: { id: 'default_master' },
    update: { active: true },
    create: {
      id: 'default_master',
      name: 'Default Master Performer',
      kind: 'STAFF',
      active: true,
    },
  });

  // 3. Check if an active OWNER already exists
  const existingOwner = await prisma.staffMember.findFirst({
    where: { role: 'OWNER', active: true },
  });

  if (existingOwner) {
    console.log(`✓ Active OWNER already exists: ${existingOwner.displayName} (${existingOwner.id}).`);
    console.log('✓ Bootstrap is idempotent; no new OWNER created.');
    process.exit(0);
  }

  // 4. Create initial OWNER identity and StaffMember
  console.log('3. No active OWNER found. Provisioning initial OWNER...');
  const ownerEmail = process.env.BOOTSTRAP_OWNER_EMAIL || 'owner@example.com';
  const ownerName = process.env.BOOTSTRAP_OWNER_NAME || 'Business Owner';
  const ownerPassword = process.env.BOOTSTRAP_OWNER_PASSWORD || randomBytes(12).toString('hex');

  // Upsert user in Better Auth user table
  const user = await prisma.user.upsert({
    where: { email: ownerEmail },
    update: { name: ownerName },
    create: {
      name: ownerName,
      email: ownerEmail,
      emailVerified: true,
    },
  });

  // Create password credential in Better Auth account table
  const passwordHash = hashPassword(ownerPassword);
  await prisma.account.upsert({
    where: { id: `account_${user.id}` },
    update: { password: passwordHash },
    create: {
      id: `account_${user.id}`,
      userId: user.id,
      accountId: user.id,
      providerId: 'credential',
      password: passwordHash,
    },
  });

  // Create owner StaffMember
  const staff = await prisma.staffMember.create({
    data: {
      authUserId: user.id,
      displayName: ownerName,
      role: 'OWNER',
      resourceId: 'default_master',
      active: true,
    },
  });

  // Emit AuditEvent
  await emitAuditEvent({
    action: 'STAFF_MEMBER_PROVISIONED',
    actorId: 'BOOTSTRAP_CLI',
    actorRole: 'OWNER',
    aggregateType: 'STAFF_MEMBER',
    aggregateId: staff.id,
    reason: 'Initial idempotent OWNER bootstrap via CLI script',
    metadataJson: {
      role: 'OWNER',
      displayName: ownerName,
    },
  });

  console.log('='.repeat(70));
  console.log('✓ Successfully bootstrapped initial OWNER:');
  console.log(`  Staff ID:     ${staff.id}`);
  console.log(`  Name:         ${ownerName}`);
  console.log(`  Email:        ${ownerEmail}`);
  console.log(`  Password:     ${ownerPassword}`);
  console.log('='.repeat(70));
  console.log('⚠️  Store these credentials securely. Temporary password will not be printed again.');
}

if (require.main === module) {
  main()
    .catch((err) => {
      console.error('❌ Bootstrap failed:', err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
