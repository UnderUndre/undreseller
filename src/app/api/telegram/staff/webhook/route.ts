import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'

import configPromise from '@payload-config'

import { handleStaffCallback } from '@/lib/telegram/staffBot'
import { verifyWebhookSecret } from '@/lib/telegram/security'

/**
 * Staff bot webhook (spec 004 US1, FR-405): secret-token timing-safe, fail-closed
 * 403 without secret, 200-degradation on any non-secret failure (Telegram must
 * never retry-storm, урок 007 F-06). Callback routing → staffBot.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!verifyWebhookSecret(req.headers.get('x-telegram-bot-api-secret-token'), 'TELEGRAM_STAFF_WEBHOOK_SECRET')) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })
  }

  try {
    const update = (await req.json()) as {
      callback_query?: { message?: { chat?: { id?: number }; message_id?: number }; data?: string }
    }
    const cb = update.callback_query
    if (cb?.data && cb.message?.chat?.id) {
      const payload = await getPayload({ config: configPromise })
      await handleStaffCallback(payload, {
        chatId: String(cb.message.chat.id),
        // 008 T813 (antigravity F4): the card message_id binds the callback to
        // the chat it was ACTUALLY sent to (outbox lookup in staffBot).
        messageId: typeof cb.message.message_id === 'number' ? cb.message.message_id : undefined,
        data: cb.data,
      })
    }
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    // 200-degradation: Telegram must not retry (outbox owns retries).
    // 008 T842 (SEC-B-07): structured log without the raw update object.
    try {
      const p = await getPayload({ config: configPromise })
      p.logger.error({ err: err instanceof Error ? { message: err.message } : {}, message: '[telegram-staff] webhook processing error (ACK 200)' })
    } catch {
      // logger unavailable (config not booted) — degrade silently
    }
    return NextResponse.json({ ok: true })
  }
}
