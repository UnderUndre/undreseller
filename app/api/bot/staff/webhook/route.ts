import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { inngest, isInngestConfigured } from '@/lib/jobs/inngest';
import { RAW_BODY_CAP_BYTES } from '@/lib/inbox/schemas';
import { logger } from '@/lib/telemetry/logger';
import { waitForBots } from '@/lib/bot/botManager';
import {
  verifyStaffWebhookSecret,
  authorizeStaffCallback,
  executeStaffCallbackTransaction,
  StaffActionType,
} from '@/lib/bot/staffActions';

const VALID_ACTIONS = new Set<StaffActionType>([
  'approve',
  'reject',
  'reschedule',
  'blacklist',
  'fulfill',
  'copy_contacts',
]);

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Ensure bots are initialized before processing webhooks
  const botsReady = await waitForBots(10000);
  if (!botsReady) {
    logger.warn('[STAFF_WEBHOOK_BOTS_NOT_READY]', { timestamp: new Date().toISOString() });
    // Continue anyway - bot handlers might not be needed for staff callback processing
  }

  const secretHeader = req.headers.get('x-telegram-bot-api-secret-token');
  if (!verifyStaffWebhookSecret(secretHeader)) {
    logger.warn('[STAFF_WEBHOOK_UNAUTHORIZED_SECRET]');
    return NextResponse.json({ error: 'Forbidden: invalid staff webhook secret' }, { status: 403 });
  }

  const rawBody = await req.text();
  if (Buffer.byteLength(rawBody, 'utf-8') > RAW_BODY_CAP_BYTES) {
    return NextResponse.json({ error: 'Payload Too Large' }, { status: 413 });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Bad Request: malformed JSON' }, { status: 400 });
  }

  const callbackQuery = body.callback_query as Record<string, unknown> | undefined;
  if (!callbackQuery) {
    return NextResponse.json({ status: 'OK_NON_CALLBACK' }, { status: 200 });
  }

  const callbackQueryId = String(callbackQuery.id || '');
  const fromObj = callbackQuery.from as Record<string, unknown> | undefined;
  const messageObj = callbackQuery.message as Record<string, unknown> | undefined;
  const chatObj = messageObj?.chat as Record<string, unknown> | undefined;
  const dataStr = String(callbackQuery.data || '');

  const fromUserId = fromObj?.id ? String(fromObj.id) : null;
  const chatId = chatObj?.id ? String(chatObj.id) : null;
  const messageId = typeof messageObj?.message_id === 'number' ? messageObj.message_id : undefined;

  const settings = await prisma.shopSettings.findUnique({ where: { id: 1 } });
  const authCheck = authorizeStaffCallback({
    chatId,
    fromUserId,
    staffDestinationChatId: settings?.staffDestinationChatId || process.env.STAFF_CHAT_ID,
    authorizedStaffUserIds: settings?.authorizedStaffUserIds || [],
  });

  if (!authCheck.authorized) {
    logger.warn('[STAFF_AUTH_DENIED]', {
      chatId,
      actorTelegramId: fromUserId,
      reason: authCheck.reason,
    });
    return NextResponse.json(
      {
        status: 'ACCESS_DENIED',
        callbackAnswer: {
          callback_query_id: callbackQueryId,
          text: 'Access denied',
          show_alert: true,
        },
      },
      { status: 403 }
    );
  }

  // Parse callback data: staff:<action>:<orderId>
  const parts = dataStr.split(':');
  if (parts.length !== 3 || parts[0] !== 'staff' || !VALID_ACTIONS.has(parts[1] as StaffActionType)) {
    return NextResponse.json({ error: 'Unsupported staff callback format' }, { status: 400 });
  }

  const action = parts[1] as StaffActionType;
  const orderId = parts[2];

  // Не мутирующее действие: отправить мастеру текст контактов новым сообщением.
  if (action === 'copy_contacts') {
    try {
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        select: {
          orderNumber: true,
          customerName: true,
          customerPhone: true,
          customerTgUsername: true,
          hasWhatsApp: true,
          hasTelegram: true,
        },
      });

      if (!order) {
        return NextResponse.json({ status: 'NOT_FOUND' }, { status: 200 });
      }

      const { formatCopyContactsText, staffBot } = await import('@/lib/bot/staffBot');
      const copyText = formatCopyContactsText({
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        customerTgUsername: order.customerTgUsername,
        hasWhatsApp: order.hasWhatsApp,
        hasTelegram: order.hasTelegram,
      });

      // Мини-ответ на callback, чтобы убрать «часики» на кнопке.
      await staffBot.api.answerCallbackQuery(callbackQueryId);

      // Новое сообщение с контактами — его удобно скопировать.
      await staffBot.api.sendMessage(chatId!, `📋 Скопируйте и отправьте клиенту:\n\n${copyText}`);

      return NextResponse.json({ status: 'COPY_CONTACTS' }, { status: 200 });
    } catch (err: unknown) {
      logger.error('Failed to build copy contacts text', {
        error: String(err),
        orderId,
      });
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  }

  try {
    const result = await executeStaffCallbackTransaction({
      callbackQueryId,
      orderId,
      action,
      actorTelegramId: fromUserId!,
      chatId: chatId!,
      messageId,
    });

    if (result.outcome === 'APPLIED' && result.emittedEvent) {
      // Inngest недоступен без INNGEST_EVENT_KEY (например, в dev): не роняем действие мастера,
      // оно уже применено в БД, шаблон ниже всё равно отправится.
      if (isInngestConfigured) {
        try {
          await inngest.send({
            name: result.emittedEvent,
            data: {
              orderId,
              actorTelegramId: fromUserId,
            },
          });
        } catch (inngestErr: unknown) {
          logger.warn('[STAFF_INNGEST_SEND_FAILED]', {
            orderId,
            action,
            event: result.emittedEvent,
            error: String(inngestErr),
          });
        }
      } else {
        logger.debug('[STAFF_INNGEST_SKIPPED]', {
          orderId,
          action,
          event: result.emittedEvent,
          reason: 'INNGEST_EVENT_KEY_NOT_CONFIGURED',
        });
      }
    }

    // Шаблонный текст для мастера: новое сообщение, которое он копирует
    // и вручную отправляет клиенту в WhatsApp/Telegram.
    if (result.outcome === 'APPLIED' && ['approve', 'reject', 'reschedule', 'blacklist', 'fulfill'].includes(action)) {
      try {
        const order = await prisma.order.findUnique({
          where: { id: orderId },
          select: {
            orderNumber: true,
            customerName: true,
            reservation: { select: { startTime: true, endTime: true, totalDurationMin: true } },
            items: {
              select: { titleSnapshot: true },
              orderBy: { id: 'asc' },
            },
          },
        });

        if (order) {
          const { formatMasterTemplate, staffBot } = await import('@/lib/bot/staffBot');
          const serviceTitles = order.items
            .map((i) => i.titleSnapshot)
            .filter((t): t is string => Boolean(t));
          const template = formatMasterTemplate(action as 'approve' | 'reject' | 'reschedule' | 'blacklist' | 'fulfill', {
            orderNumber: order.orderNumber,
            customerName: order.customerName,
            serviceTitles,
            totalDurationMin: order.reservation?.totalDurationMin ?? null,
            startTimeIso: order.reservation?.startTime?.toISOString() ?? null,
            endTimeIso: order.reservation?.endTime?.toISOString() ?? null,
            magicRescheduleUrl: result.magicRescheduleUrl ?? null,
          });

          // Мини-ответ на callback, чтобы убрать «часики» на кнопке.
          await staffBot.api.answerCallbackQuery(callbackQueryId);

          // Новое сообщение с шаблоном — его удобно скопировать.
          await staffBot.api.sendMessage(chatId!, template);
        }
      } catch (templateErr: unknown) {
        logger.warn('[STAFF_TEMPLATE_MESSAGE_FAILED]', {
          orderId,
          action,
          error: String(templateErr),
        });
      }
    }

    return NextResponse.json(
      {
        status: result.outcome,
        emittedEvent: result.emittedEvent,
        magicRescheduleUrl: result.magicRescheduleUrl,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    logger.error('Failed to process staff webhook callback', {
      error: String(err),
      orderId,
      action,
    });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
