import { Bot } from 'grammy'

/**
 * Bot manager (spec 004 US1, research D8): lazy initialization of the two
 * grammY instances from env; bots are OPTIONAL — a deployment without tokens
 * degrades to a no-op (webhooks answer 200 + degradation log, outbox keeps
 * accumulating) instead of crashing (white-label canon).
 */

export type BotName = 'staff' | 'client'

export interface BotLike {
  api: {
    sendMessage(chatId: string | number, text: string, opts?: Record<string, unknown>): Promise<{ message_id: number }>
    editMessageText(chatId: string | number, messageId: number, text: string, opts?: Record<string, unknown>): Promise<unknown>
    editMessageReplyMarkup(chatId: string | number, messageId: number, markup: unknown): Promise<unknown>
  }
}

const bots = new Map<BotName, BotLike | null>()

function tokenFor(name: BotName): string | undefined {
  return name === 'staff'
    ? process.env.STAFF_BOT_TOKEN ?? process.env.TELEGRAM_STAFF_BOT_TOKEN
    : process.env.CLIENT_BOT_TOKEN ?? process.env.TELEGRAM_CLIENT_BOT_TOKEN
}

/** Returns the bot or null when unconfigured/degraded — callers MUST no-op safely. */
export function getBot(name: BotName): BotLike | null {
  if (bots.has(name)) return bots.get(name) ?? null
  const token = tokenFor(name)
  if (!token) {
    bots.set(name, null)
    return null
  }
  try {
    // grammY Bot does not touch the network in the constructor; api calls fail
    // at call-time (outbox classifies them as TRANSIENT/PERMANENT).
    bots.set(name, new Bot(token) as unknown as BotLike)
    return bots.get(name) as BotLike
  } catch {
    bots.set(name, null)
    return null
  }
}

/** Deploy hook: resolves when both configured bots answer getMe, or on timeout. */
export async function waitForBots(timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  for (const name of ['staff', 'client'] as BotName[]) {
    const bot = getBot(name)
    if (!bot) continue
    while (Date.now() < deadline) {
      try {
        await (bot as unknown as { api: { getMe(): Promise<unknown> } }).api.getMe()
        break
      } catch {
        await new Promise((r) => setTimeout(r, 250))
      }
    }
  }
}
