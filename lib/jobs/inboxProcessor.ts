/**
 * Inbox event processor - handles Telegram and other async events
 * Extracted to separate file to avoid circular imports and browser bundling issues
 */

import { logger } from '@/lib/telemetry/logger';
import { handleClientConfirmationCallback } from '@/lib/bot/clientConfirmation';
import { bot, sendWithRetry } from '@/lib/bot/telegramBot';
import { staffBot } from '@/lib/bot/staffBot';

export async function processInboxEventRow(eventRow: {
  id: string;
  kind: string;
  payloadJson: unknown;
  attemptCount: number;
}): Promise<void> {
  const payload = eventRow.payloadJson as Record<string, unknown>;
  logger.info(`Processing inbox event ${eventRow.id} of kind ${eventRow.kind}`);

  switch (eventRow.kind) {
    case 'SYSTEM_ALERT': {
      console.log(`[ALERT_DISPATCH] orderId=${payload.orderId} reason=${payload.reason}`);
      break;
    }
    case 'TELEGRAM_UPDATE': {
      const text = payload.text as string | undefined;
      
      // Handle client confirmation callback_query (FR-013)
      if (text && text.startsWith('client:')) {
        const parts = text.split(':');
        if (parts.length >= 3) {
          const action = parts[1]; // 'confirm' or 'decline'
          const orderId = parts[2]; // order ID
          
          if ((action === 'confirm' || action === 'decline') && orderId) {
            try {
              const result = await handleClientConfirmationCallback({
                orderId,
                decision: action as 'confirm' | 'decline',
              });
              
              logger.info('[CLIENT_CONFIRMATION_PROCESSED]', {
                orderId,
                decision: action,
                outcome: result.outcome,
              });
            } catch (err: unknown) {
              logger.error('[CLIENT_CONFIRMATION_ERROR]', {
                orderId,
                decision: action,
                error: String(err),
              });
            }
          }
        }
      }
      
      logger.info(`[TELEGRAM_DISPATCH] chatId=${payload.chatId} action=${payload.action || 'update'}`);
      break;
    }
    case 'TELEGRAM_OUTBOUND':
    case 'STAFF_BOT_OUTBOUND': {
      try {
        const chatId = payload.chatId as string;
        const action = payload.action as string;
        const messageId = payload.messageId as number | undefined;
        const text = payload.text as string | undefined;
        const replyMarkup = payload.replyMarkup as Record<string, unknown> | null | undefined;
        const orderId = payload.orderId as string | undefined;

        // Select correct bot based on kind
        const targetBot = eventRow.kind === 'STAFF_BOT_OUTBOUND' ? staffBot : bot;

        // Execute the appropriate API call
        switch (action) {
          case 'sendMessage': {
            if (!text) throw new Error('sendMessage requires text');
            
            await sendWithRetry(() =>
              targetBot.api.sendMessage(chatId, text, {
                parse_mode: 'HTML',
                reply_markup: replyMarkup as any,
              })
            );
            
            logger.info('[TELEGRAM_OUTBOUND_SENT]', {
              orderId,
              chatId,
              action: 'sendMessage',
              kind: eventRow.kind,
            });
            break;
          }

          case 'editMessageText': {
            if (!text || !messageId) throw new Error('editMessageText requires text and messageId');
            
            await sendWithRetry(() =>
              targetBot.api.editMessageText(chatId, messageId, text, {
                parse_mode: 'HTML',
                reply_markup: replyMarkup as any,
              })
            );
            
            logger.info('[TELEGRAM_OUTBOUND_SENT]', {
              orderId,
              chatId,
              action: 'editMessageText',
              messageId,
              kind: eventRow.kind,
            });
            break;
          }

          case 'editMessageReplyMarkup': {
            if (!messageId) throw new Error('editMessageReplyMarkup requires messageId');
            
            await sendWithRetry(() =>
              targetBot.api.editMessageReplyMarkup(chatId, messageId, {
                reply_markup: replyMarkup as any,
              })
            );
            
            logger.info('[TELEGRAM_OUTBOUND_SENT]', {
              orderId,
              chatId,
              action: 'editMessageReplyMarkup',
              messageId,
              kind: eventRow.kind,
            });
            break;
          }

          default:
            throw new Error(`Unknown action: ${action}`);
        }
      } catch (err: unknown) {
        throw err;
      }
      break;
    }

    default:
      logger.warn(`Unknown inbox event kind: ${eventRow.kind}`);
  }
}
