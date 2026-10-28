import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { inngest } from '@/lib/jobs/inngest';
import { handleStarsWebhookUpdate } from '@/lib/payments/stars';
import { RAW_BODY_CAP_BYTES, validateCanonicalPayload } from '@/lib/inbox/schemas';
import { logger } from '@/lib/telemetry/logger';
import { checkRateLimit } from '@/lib/security/rateLimiter';
import { bot } from '@/lib/bot/telegramBot';
import { waitForBots } from '@/lib/bot/botManager';
import { Prisma } from '@prisma/client';


export async function POST(req: NextRequest): Promise<NextResponse> {
  const secretHeader = req.headers.get('x-telegram-bot-api-secret-token');
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;

  logger.info('[TELEGRAM_WEBHOOK_RECEIVED]', {
    method: 'POST',
    path: '/api/bot/telegram/webhook',
    hasSecretHeader: !!secretHeader,
    expectedSecret: !!expectedSecret,
    timestamp: new Date().toISOString(),
  });

  if (!expectedSecret || secretHeader !== expectedSecret) {
    logger.warn('Unauthorized Telegram webhook attempt');
    return new NextResponse('Forbidden: invalid webhook secret', { status: 403 });
  }

  const rawBody = await req.text();
  if (Buffer.byteLength(rawBody, 'utf-8') > RAW_BODY_CAP_BYTES) {
    return new NextResponse('Payload Too Large', { status: 413 });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return new NextResponse('Bad Request: malformed JSON', { status: 400 });
  }

  // Synchronous Stars path
  const starsResult = await handleStarsWebhookUpdate(body);
  if (starsResult.handled) {
    return new NextResponse('OK', { status: starsResult.status || 200 });
  }

  // Rate Limiting on chat_id or IP
  const message = body.message as Record<string, unknown> | undefined;
  const callbackQuery = body.callback_query as Record<string, unknown> | undefined;
  const chat = (message?.chat || callbackQuery?.message) as Record<string, unknown> | undefined;

  const chatId = chat?.id || req.headers.get('x-forwarded-for') || 'anon';

  const rateCheck = checkRateLimit(`tg_${chatId}`, 10);
  if (!rateCheck.allowed) {
    return new NextResponse('Too Many Requests', { status: 429 });
  }

  const updateId = body.update_id;
  if (!updateId) {
    return new NextResponse('OK', { status: 200 });
  }

  const updateType =
    Object.keys(body).find((k) => k !== 'update_id' && typeof body[k] === 'object') || 'message';
  const messageText = (message?.text || callbackQuery?.data) as string | undefined;

  const canonical = {
    version: 1 as const,
    kind: 'TELEGRAM_UPDATE' as const,
    chatId: String(chatId),
    updateType,
    text: messageText ? String(messageText).slice(0, 2000) : undefined,
  };

  const validation = validateCanonicalPayload(canonical);
  if (!validation.success) {
    logger.error('Invalid canonical telegram payload', { error: validation.error });
    return new NextResponse('Bad Request: schema validation failed', { status: 400 });
  }

  try {
    // Store event for audit trail
    const inboxRow = await prisma.inboxEvent.create({
      data: {
        provider: 'TELEGRAM',
        eventId: String(updateId),
        kind: 'TELEGRAM_UPDATE',
        payloadJson: validation.data as Prisma.InputJsonObject,
        status: 'PENDING',
      },
    });

    logger.info('[TELEGRAM_UPDATE_STORED]', {
      inboxRowId: inboxRow.id,
      updateId,
      updateType,
      messageText,
    });

    // Process immediately via grammy bot (fire-and-forget to return response quickly)
    // Wait for bots to be initialized (with timeout), then handle update
    (async () => {
      try {
        const botsReady = await waitForBots(10000);
        
        if (botsReady) {
          logger.info('[TELEGRAM_BOT_HANDLE_UPDATE_START]', {
            updateId,
            updateType,
            hasUpdateBody: !!body,
          });

          await bot.handleUpdate(body as unknown as Parameters<typeof bot.handleUpdate>[0]);

          logger.info('[BOT_UPDATE_HANDLED]', { updateId, chatId, messageText });
        } else {
          logger.warn('[BOT_INIT_TIMEOUT_ON_UPDATE]', { updateId, updateType });
          // Queue for later processing
          inngest.send({
            name: 'telegram/update.received',
            data: {
              eventId: inboxRow.id,
            },
          }).catch((inngestErr: unknown) => {
            logger.warn('[INNGEST_SEND_FAILED]', { error: String(inngestErr), eventId: inboxRow.id });
          });
        }
      } catch (err: unknown) {
        logger.error('[BOT_UPDATE_FAILED]', { 
          updateId, 
          error: String(err),
          stack: err instanceof Error ? err.stack : undefined,
        });
      }
    })().catch((err) => logger.error('[BOT_HANDLER_UNCAUGHT_ERROR]', { error: String(err) }));

    return new NextResponse('OK', { status: 200 });
  } catch (err: unknown) {
    if (typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === 'P2002') {
      return new NextResponse('OK (duplicate)', { status: 200 });
    }

    logger.error('Failed to process Telegram update', { error: String(err) });
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
