import { Bot, InlineKeyboard } from 'grammy';
import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/telemetry/logger';
import { handleClientConfirmationCallback } from './clientConfirmation';

const token = process.env.TELEGRAM_BOT_TOKEN || 'DUMMY_TOKEN_FOR_BUILD';

// Log bot initialization details
const isDummy = token === 'DUMMY_TOKEN_FOR_BUILD';
console.log('[TELEGRAM_BOT_INIT]', {
  isDummyToken: isDummy,
  tokenPrefix: isDummy ? 'N/A' : token.split(':')[0],
  timestamp: new Date().toISOString(),
});

/**
 * Get cached botInfo from globalThis if available.
 * This survives Next.js module hot-reloads during development.
 */
function getCachedBotInfo(): any {
  if (typeof globalThis !== 'undefined' && (globalThis as any).__clientBotInfo) {
    return (globalThis as any).__clientBotInfo;
  }
  return undefined;
}

// Create bot with cached botInfo if available
const cachedBotInfo = getCachedBotInfo();
export const bot = new Bot(token, {
  botInfo: cachedBotInfo,
});

// Log after bot is created
console.log('[TELEGRAM_BOT_CREATED]', { 
  timestamp: new Date().toISOString(),
  hasCachedBotInfo: !!cachedBotInfo,
});

export async function sendWithRetry<T>(fn: () => Promise<T>, maxRetries = 3, initialDelayMs = 500): Promise<T> {
  let attempt = 0;
  let delay = initialDelayMs;

  while (attempt < maxRetries) {
    try {
      return await fn();
    } catch (err: unknown) {
      attempt++;
      if (attempt >= maxRetries) {
        logger.error('[OUTBOUND_DISPATCH_FAIL]', { error: String(err), attempts: attempt });
        throw err;
      }

      const retryAfterSec = (err as { parameters?: { retry_after?: number } })?.parameters?.retry_after;
      const waitMs = retryAfterSec ? retryAfterSec * 1000 : delay + Math.random() * 200;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      delay *= 2;
    }
  }

  throw new Error('Unreachable retry state');
}

bot.command('start', async (ctx) => {
  logger.info('[BOT_COMMAND_START]', { 
    fromId: ctx.from?.id,
    fromUsername: ctx.from?.username,
  });

  if (!ctx.from) return;

  const externalId = String(ctx.from.id);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://undreseller.com';

  try {
    await prisma.messengerContact.upsert({
      where: {
        platform_externalId: {
          platform: 'TELEGRAM',
          externalId,
        },
      },
      update: {
        isBlocked: false,
      },
      create: {
        platform: 'TELEGRAM',
        externalId,
        isBlocked: false,
      },
    });

    const settings = await prisma.shopSettings.findUnique({
      where: { id: 1 },
      select: { greeting: true },
    });

    const greetingText = settings?.greeting || '👋 Welcome to our store!';

    const keyboard = new InlineKeyboard()
      .webApp('🛍️ Open Storefront', appUrl)
      .row()
      .text('👨‍💼 Contact Manager', 'contact_manager');

    await sendWithRetry(() => ctx.reply(greetingText, { reply_markup: keyboard }));
  } catch (err) {
    logger.error('Failed to handle /start', { error: String(err) });
  }
});

bot.command('help', async (ctx) => {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://undreseller.com';
  const keyboard = new InlineKeyboard().webApp('🛍️ Open Storefront', appUrl);
  await sendWithRetry(() =>
    ctx.reply(
      '💡 You can browse our catalog, book services, or purchase products directly via our Mini App below.',
      { reply_markup: keyboard }
    )
  );
});

bot.callbackQuery('contact_manager', async (ctx) => {
  if (!ctx.from) return;
  const externalId = String(ctx.from.id);

  try {
    const ticket = await prisma.escalationTicket.create({
      data: {
        platform: 'TELEGRAM',
        senderId: externalId,
        queryText: 'User requested manager assistance via bot button',
      },
    });

    const adminChatId = process.env.ADMIN_CHAT_ID;
    if (adminChatId) {
      await sendWithRetry(() =>
        bot.api.sendMessage(
          adminChatId,
          `🚨 [ESCALATION] Ticket #${ticket.id.slice(0, 8)}: Telegram user @${ctx.from?.username || externalId} requested manager assistance.`
        )
      );
    }

    await ctx.answerCallbackQuery({ text: 'Manager notified!' });
    await ctx.reply('✅ An operator has been notified and will get back to you shortly.');
  } catch (err) {
    logger.error('Failed to escalate to manager', { error: String(err) });
    await ctx.answerCallbackQuery({ text: 'Could not notify manager' });
  }
});

// Handle client confirmation/decline callbacks: client:confirm:orderId or client:decline:orderId
bot.callbackQuery(/^client:(confirm|decline):(.+)$/, async (ctx) => {
  if (!ctx.from) return;

  const match = ctx.match as RegExpExecArray;
  const decision = match[1] as 'confirm' | 'decline';
  const orderId = match[2];

  try {
    const result = await handleClientConfirmationCallback({
      orderId,
      decision,
      customerTgId: String(ctx.from.id),
    });

    await ctx.answerCallbackQuery({ text: result.replyMessage });
    await ctx.reply(result.replyMessage);
    
    logger.info('[CLIENT_CONFIRMATION_CALLBACK]', {
      orderId,
      decision,
      outcome: result.outcome,
      userId: ctx.from.id,
    });
  } catch (err) {
    logger.error('Failed to process client confirmation callback', {
      error: String(err),
      orderId,
      decision,
    });
    await ctx.answerCallbackQuery({
      text: '❌ Ошибка при обработке. Пожалуйста, попробуйте позже.',
    });
  }
});

bot.on('my_chat_member', async (ctx) => {
  if (!ctx.from) return;
  const externalId = String(ctx.from.id);
  const newStatus = ctx.myChatMember.new_chat_member.status;
  const isBlocked = newStatus === 'kicked' || newStatus === 'left';

  try {
    await prisma.messengerContact.upsert({
      where: {
        platform_externalId: {
          platform: 'TELEGRAM',
          externalId,
        },
      },
      update: { isBlocked },
      create: {
        platform: 'TELEGRAM',
        externalId,
        isBlocked,
      },
    });
    logger.info(`Telegram contact ${externalId} isBlocked updated to ${isBlocked}`);
  } catch (err) {
    logger.error('Failed to update contact block status', { error: String(err) });
  }
});
