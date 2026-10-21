import { bot } from './telegramBot';
import { staffBot } from './staffBot';
import { logger } from '@/lib/telemetry/logger';

/**
 * Global bot initialization state (survives module hot-reloads in Next.js dev mode)
 */
declare global {
  var __botsInitPromise: Promise<void> | null;
  var __botsInitialized: boolean;
  var __clientBotInfo: any;
  var __staffBotInfo: any;
}

globalThis.__botsInitialized ??= false;
globalThis.__botsInitPromise ??= null;
globalThis.__clientBotInfo ??= null;
globalThis.__staffBotInfo ??= null;

/**
 * Initialize bot info one time at server startup.
 * This fetches bot metadata from Telegram API (name, ID, etc.)
 * Required for webhook mode to work properly.
 * 
 * Must be called before any webhooks can process updates.
 */
export async function initializeBots(): Promise<void> {
  if (globalThis.__botsInitialized) {
    logger.debug('[BOT_INIT_SKIP]', { reason: 'already_initialized' });
    // Restore botInfo to current bot instance
    if (globalThis.__clientBotInfo && !bot.botInfo) {
      bot.botInfo = globalThis.__clientBotInfo;
    }
    if (globalThis.__staffBotInfo && !staffBot.botInfo) {
      staffBot.botInfo = globalThis.__staffBotInfo;
    }
    return;
  }

  // If initialization is already in progress, wait for it
  if (globalThis.__botsInitPromise) {
    logger.debug('[BOT_INIT_WAIT]', { reason: 'already_in_progress' });
    return globalThis.__botsInitPromise;
  }

  try {
    globalThis.__botsInitPromise = (async () => {
      logger.info('[BOT_INIT_START]', { timestamp: new Date().toISOString() });

      // Initialize client bot
      await bot.init();
      const clientBotInfo = await bot.api.getMe();
      globalThis.__clientBotInfo = clientBotInfo;
      logger.info('[BOT_CLIENT_INIT_OK]', { 
        botId: clientBotInfo.id,
        username: clientBotInfo.username,
      });

      // Initialize staff bot
      await staffBot.init();
      const staffBotInfo = await staffBot.api.getMe();
      globalThis.__staffBotInfo = staffBotInfo;
      logger.info('[BOT_STAFF_INIT_OK]', { 
        botId: staffBotInfo.id,
        username: staffBotInfo.username,
      });

      globalThis.__botsInitialized = true;
      logger.info('[BOT_INIT_COMPLETE]', { timestamp: new Date().toISOString() });
    })();

    await globalThis.__botsInitPromise;
  } catch (error) {
    logger.error('[BOT_INIT_FAILED]', { error });
    globalThis.__botsInitPromise = null;
    throw error;
  }
}

/**
 * Wait for bots to be initialized (with timeout)
 * Used by webhook handlers to ensure bot is ready before processing
 */
export async function waitForBots(timeoutMs: number = 5000): Promise<boolean> {
  if (globalThis.__botsInitialized) {
    return true;
  }

  if (!globalThis.__botsInitPromise) {
    return false; // Not initialized and not in progress
  }

  try {
    await Promise.race([
      globalThis.__botsInitPromise,
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Bot init timeout')), timeoutMs)
      ),
    ]);
    return globalThis.__botsInitialized;
  } catch (error) {
    logger.warn('[BOT_INIT_TIMEOUT]', { error, timeoutMs });
    return false;
  }
}

/**
 * Check if bots are initialized
 */
export function areBotsCoreInitialized(): boolean {
  return globalThis.__botsInitialized;
}
