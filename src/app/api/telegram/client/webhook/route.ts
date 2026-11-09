import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'

import configPromise from '@payload-config'

import { handleClientCallback, linkChat } from '@/lib/telegram/clientBot'
import { verifyWebhookSecret } from '@/lib/telegram/security'

/**
 * Client bot webhook (spec 004 US1, FR-405): same security canon as staff.
 * Routes /start (deep-link linking) and client callbacks.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!verifyWebhookSecret(req.headers.get('x-telegram-bot-api-secret-token'), 'TELEGRAM_CLIENT_WEBHOOK_SECRET')) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })
  }

  try {
    const update = (await req.json()) as {
      message?: { chat?: { id?: number }; text?: string }
      callback_query?: { message?: { chat?: { id?: number } }; data?: string }
    }
    const payload = await getPayload({ config: configPromise })

    if (update.message?.chat?.id && typeof update.message.text === 'string' && update.message.text.startsWith('/start')) {
      const token = update.message.text.split(' ')[1] ?? ''
      await linkChat(payload, String(update.message.chat.id), token)
      return NextResponse.json({ ok: true })
    }

    const cb = update.callback_query
    if (cb?.data && cb.message?.chat?.id) {
      await handleClientCallback(payload, { chatId: String(cb.message.chat.id), data: cb.data })
    }
    return NextResponse.json({ ok: true })
  } catch (err: unknown) {
    console.error('[telegram-client] webhook processing error (ACK 200):', err)
    return NextResponse.json({ ok: true })
  }
}
