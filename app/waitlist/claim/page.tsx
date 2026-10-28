/**
 * Mini App waitlist claim page (T072, US5, FR-420/433).
 * Deep-linked from the TG offer inline button: /waitlist/claim?token=...
 * Server-side claimOffer is the atomic single-winner gate; losers and late
 * claimants get a definitive outcome (taken / expired / invalid).
 * On success the page shows the booking prefill link — the booking itself
 * rides the standard storefront path (notification priority, not reservation).
 */

import Link from 'next/link';
import { prisma } from '@/lib/db/prisma';
import { claimOffer } from '@/lib/waitlist/waitlistService';
import { getTranslations } from 'next-intl/server';

export const dynamic = 'force-dynamic';

// T040 (FR-411): outcome copy keyed in messages/web.waitlistClaim (ru/en).
type FailReason = 'INVALID_TOKEN' | 'ALREADY_USED' | 'EXPIRED';

const FAIL_KEYS: Record<Exclude<FailReason, 'INVALID_TOKEN'> | 'INVALID_TOKEN', { title: string; detail: string }> = {
  INVALID_TOKEN: { title: 'invalidTokenTitle', detail: 'invalidTokenDetail' },
  ALREADY_USED: { title: 'alreadyUsedTitle', detail: 'alreadyUsedDetail' },
  EXPIRED: { title: 'expiredTitle', detail: 'expiredDetail' },
};

export default async function WaitlistClaimPage(props: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await props.searchParams;
  // T040 (FR-411): chrome i18n — claim outcomes are chrome, service title is authored data.
  const t = await getTranslations('web.waitlistClaim');

  if (!token) {
    return (
      <ClaimOutcome
        title={t('invalidTokenTitle')}
        detail={t('invalidTokenDetail')}
        browseLabel={t('browseSlots')}
      />
    );
  }

  const result = await claimOffer({ token });

  if (!result.ok) {
    const keys = FAIL_KEYS[(result.reason as FailReason) ?? 'INVALID_TOKEN'] ?? FAIL_KEYS.INVALID_TOKEN;
    return <ClaimOutcome title={t(keys.title)} detail={t(keys.detail)} browseLabel={t('browseSlots')} />;
  }

  const entry = await prisma.waitlistEntry.findUnique({
    where: { id: result.entryId },
    include: { service: { select: { id: true, title: true, durationMin: true } } },
  });

  const serviceId = entry?.serviceId ?? null;
  const serviceTitle = entry?.service?.title;

  return (
    <div className="max-w-xl mx-auto px-4 py-10">
      <div className="bg-base-200 border border-base-300 rounded-2xl p-6 sm:p-8 space-y-5 text-base-content">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 bg-success/20 text-success rounded-full flex items-center justify-center mx-auto text-2xl font-bold border border-success/40">
            ✓
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight">{t('claimedTitle')}</h1>
          <p className="text-sm text-base-content/60">{t('claimedBody')}</p>
        </div>

        {serviceTitle && (
          <div className="bg-base-100 rounded-xl p-4 text-sm border border-base-300">
            <div className="flex justify-between">
              <span className="text-base-content/60">{t('service')}</span>
              <span className="font-semibold">{serviceTitle}</span>
            </div>
            {entry?.service?.durationMin && (
              <div className="flex justify-between pt-2">
                <span className="text-base-content/60">{t('duration')}</span>
                <span className="font-semibold">{t('minutes', { minutes: entry.service.durationMin })}</span>
              </div>
            )}
          </div>
        )}

        {serviceId ? (
          <Link
            href={`/book?serviceId=${encodeURIComponent(serviceId)}`}
            className="block w-full text-center bg-purple-600 hover:bg-purple-500 text-white font-bold py-3 px-4 rounded-xl text-sm transition-all shadow-md"
          >
            {t('completeBooking', { suffix: serviceTitle ? ` — ${serviceTitle}` : '' })}
          </Link>
        ) : (
          <Link
            href="/book"
            className="block w-full text-center bg-purple-600 hover:bg-purple-500 text-white font-bold py-3 px-4 rounded-xl text-sm transition-all shadow-md"
          >
            {t('openStorefront')}
          </Link>
        )}
      </div>
    </div>
  );
}

function ClaimOutcome({ title, detail, browseLabel }: { title: string; detail: string; browseLabel: string }) {
  return (
    <div className="max-w-xl mx-auto px-4 py-10">
      <div className="bg-base-200 border border-base-300 rounded-2xl p-6 sm:p-8 space-y-4 text-base-content text-center">
        <h1 className="text-xl font-bold">{title}</h1>
        <p className="text-sm text-base-content/60">{detail}</p>
        <Link
          href="/book"
          className="inline-block bg-purple-600 hover:bg-purple-500 text-white font-bold py-2.5 px-5 rounded-xl text-sm transition-all"
        >
          {browseLabel}
        </Link>
      </div>
    </div>
  );
}
