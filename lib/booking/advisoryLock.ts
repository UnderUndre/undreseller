import { Prisma } from '@prisma/client';

export async function acquireResourceSlotLock(
  tx: Prisma.TransactionClient,
  resourceId = 'default_master'
): Promise<void> {
  const lockKey = `resource_slot_lock_${resourceId}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
}

export async function acquireItemSlotLock(
  tx: Prisma.TransactionClient,
  itemId: string
): Promise<void> {
  const lockKey = `slot_lock_${itemId}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
}
