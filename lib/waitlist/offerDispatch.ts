/**
 * Waitlist offer dispatch (T072, US5, FR-420): after fanoutForSlot marks the
 * bounded batch SENT, each customer gets a Telegram message with an inline
 * claim button deep-linking into the Mini App claim page
 * (/waitlist/claim?token=...). The claim itself rides the standard atomic
 * path (claimOffer → booking), so the link is an offer, not a reservation.
 */

import { InlineKeyboard } from 'grammy';
import { bot, sendWithRetry } from '@/lib/bot/telegramBot';
import { logger } from '@/lib/telemetry/logger';
import { fanoutForSlot, OFFER_TTL_MS } from './waitlistService';

const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL || 'https://undreseller.com';

export function waitlistOfferText(): string {
  const ttlMinutes = Math.round(OFFER_TTL_MS / 60000);
  return (
    `🔔 A slot you were waiting for just opened up.\n\n` +
    `Tap below to claim it — first come, first served, and only ` +
    `if it is still available (the slot stays open to everyone).\n` +
    `The offer expires silently in ~${ttlMinutes} minutes.`
  );
}

export function claimDeepLink(token: string): string {
  return `${APP_URL()}/waitlist/claim?token=${encodeURIComponent(token)}`;
}

/**
 * Dispatch TG offers for a freed slot. Fire-and-forget safe: a send failure is
 * logged and does not throw into the cancellation flow (FR-409 symmetry).
 */
export async function dispatchWaitlistOffers(params: {
  slotReservationId: string;
  serviceId?: string | null;
  professionalProfileId?: string | null;
  now?: Date;
}): Promise<{ dispatched: number; failed: number }> {
  const { offers } = await fanoutForSlot(params);

  let failed = 0;
  for (const offer of offers) {
    const keyboard = new InlineKeyboard().webApp('✅ Claim this slot', claimDeepLink(offer.token));
    try {
      await sendWithRetry(() =>
        bot.api.sendMessage(offer.customerTgId, waitlistOfferText(), { reply_markup: keyboard })
      );
      logger.info('[WAITLIST_OFFER_DISPATCHED]', {
        waitlistEntryId: offer.entryId,
        customerTgId: offer.customerTgId,
        slotReservationId: params.slotReservationId,
      });
    } catch (err: unknown) {
      failed++;
      logger.error('[WAITLIST_OFFER_DISPATCH_FAIL]', {
        waitlistEntryId: offer.entryId,
        customerTgId: offer.customerTgId,
        error: String(err),
      });
    }
  }

  return { dispatched: offers.length - failed, failed };
}
