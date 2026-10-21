import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

try {
  const events = await prisma.inboxEvent.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: {
      id: true,
      kind: true,
      status: true,
      botProfile: true,
      chatId: true,
      createdAt: true,
      payloadJson: true,
    },
  });

  console.log('=== Recent Inbox Events ===');
  console.log(JSON.stringify(events, null, 2));

  const staffEvents = await prisma.inboxEvent.findMany({
    where: {
      kind: 'STAFF_BOT_OUTBOUND',
    },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });

  console.log('\n=== STAFF_BOT_OUTBOUND Events Only ===');
  console.log(JSON.stringify(staffEvents, null, 2));
} finally {
  await prisma.$disconnect();
}
