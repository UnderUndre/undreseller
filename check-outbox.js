const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const messages = await prisma.telegramOutbox.findMany({
    where: { direction: 'OUTGOING' },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
  
  console.log('Recent outgoing Telegram messages:');
  if (messages.length === 0) {
    console.log('  (none)');
  } else {
    messages.forEach(m => {
      console.log(`  Chat: ${m.chatId}, Status: ${m.status}, Created: ${m.createdAt.toISOString()}`);
      if (m.payload) {
        try {
          const payload = typeof m.payload === 'string' ? JSON.parse(m.payload) : m.payload;
          if (payload.text) {
            console.log(`    Text: ${payload.text.substring(0, 80)}...`);
          }
        } catch (e) {
          // ignore
        }
      }
    });
  }
  
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
