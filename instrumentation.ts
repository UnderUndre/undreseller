/**
 * Next.js instrumentation hook - runs once at server startup
 * Used to initialize bots and perform other startup tasks
 */

import { initializeBots } from '@/lib/bot/botManager';
import { startInboxPoller } from '@/lib/jobs/inboxPoller';
import { logger } from '@/lib/telemetry/logger';

export async function register() {
  // Only run on server
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    try {
      logger.info('[INSTRUMENTATION_REGISTER]', { timestamp: new Date().toISOString() });
      
      // Initialize Telegram bots
      // This fetches bot metadata from Telegram API (required for webhook mode)
      await initializeBots();
      
      // Start background inbox poller (processes queued Telegram messages)
      startInboxPoller();
      
      logger.info('[INSTRUMENTATION_COMPLETE]', { timestamp: new Date().toISOString() });
    } catch (error) {
      logger.error('[INSTRUMENTATION_FAILED]', { error });
      // Don't throw - allow server to start even if bot init fails
      // Webhooks might still work if they retry
    }
  }
}
