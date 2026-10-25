/**
 * Next.js instrumentation hook - runs once at server startup
 * Used to initialize bots and perform other startup tasks
 */

// Lazy dynamic imports: instrumentation is bundled for BOTH runtimes (nodejs +
// edge) even though register() only runs on nodejs. Static imports of modules
// that touch node:* (bots -> prisma/crypto chain) break the edge bundle with
// UnhandledSchemeError. Everything heavy is loaded inside register().

export async function register() {
  // Only run on server
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initializeBots } = await import('@/lib/bot/botManager');
    const { startInboxPoller } = await import('@/lib/jobs/inboxPoller');
    const { logger } = await import('@/lib/telemetry/logger');
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
