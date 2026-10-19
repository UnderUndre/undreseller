import { prisma } from '@/lib/db/prisma';

export async function checkAndUpdateCooldown(phone: string): Promise<{ allowed: boolean }> {
  const contact = await prisma.messengerContact.findUnique({
    where: {
      platform_externalId: {
        platform: 'WHATSAPP',
        externalId: phone,
      },
    },
  });

  const now = new Date();
  const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

  if (contact?.lastAutoReplyAt) {
    const elapsed = now.getTime() - contact.lastAutoReplyAt.getTime();
    if (elapsed < TWENTY_FOUR_HOURS_MS) {
      return { allowed: false };
    }
  }

  // Upsert contact and update lastAutoReplyAt
  await prisma.messengerContact.upsert({
    where: {
      platform_externalId: {
        platform: 'WHATSAPP',
        externalId: phone,
      },
    },
    update: {
      lastAutoReplyAt: now,
    },
    create: {
      platform: 'WHATSAPP',
      externalId: phone,
      lastAutoReplyAt: now,
    },
  });

  return { allowed: true };
}
