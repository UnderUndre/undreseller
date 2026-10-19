import { Prisma } from '@prisma/client';

export async function acquireItemSlotLock(
  tx: Prisma.TransactionClient,
  itemId: string
): Promise<void> {
  const lockKey = `slot_lock_${itemId}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
}
