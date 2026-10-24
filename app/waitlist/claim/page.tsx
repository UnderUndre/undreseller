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

export const dynamic = 'force-dynamic';

const FAIL_COPY: Record<string, { title: string; detail: string }> = {
  INVALID_TOKEN: {
    title: 'Link not recognised',
    detail: 'This claim link is invalid. If you received several offers, use the most recent message.',
  },
  ALREADY_USED: {
    title: 'Offer already taken',
    detail: 'Someone claimed this slot before you — or you already claimed it. The slot is no longer held for this offer.',
  },
  EXPIRED: {
    title: 'Offer expired',
    detail: 'This offer expired silently after its window. You can still book the slot from the storefront if it is available.',
  },
};

export default async function WaitlistClaimPage(props: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await props.searchParams;

  if (!token) {
    return <ClaimOutcome title="Link not recognised" detail={FAIL_COPY.INVALID_TOKEN.detail} />;
  }

  const result = await claimOffer({ token });

  if (!result.ok) {
    const copy = FAIL_COPY[result.reason ?? 'INVALID_TOKEN'] ?? FAIL_COPY.INVALID_TOKEN;
    return <ClaimOutcome title={copy.title} detail={copy.detail} />;
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
          <h1 className="text-2xl font-extrabold tracking-tight">Slot claimed!</h1>
          <p className="text-sm text-base-content/60">
            The slot is yours to finish booking — it stays open to everyone until your booking is
            confirmed, so complete it now.
          </p>
        </div>

        {serviceTitle && (
          <div className="bg-base-100 rounded-xl p-4 text-sm border border-base-300">
            <div className="flex justify-between">
              <span className="text-base-content/60">Service:</span>
              <span className="font-semibold">{serviceTitle}</span>
            </div>
            {entry?.service?.durationMin && (
              <div className="flex justify-between pt-2">
                <span className="text-base-content/60">Duration:</span>
                <span className="font-semibold">{entry.service.durationMin} minutes</span>
              </div>
            )}
          </div>
        )}

        {serviceId ? (
          <Link
            href={`/book?serviceId=${encodeURIComponent(serviceId)}`}
            className="block w-full text-center bg-purple-600 hover:bg-purple-500 text-white font-bold py-3 px-4 rounded-xl text-sm transition-all shadow-md"
          >
            Complete booking{serviceTitle ? ` — ${serviceTitle}` : ''}
          </Link>
        ) : (
          <Link
            href="/book"
            className="block w-full text-center bg-purple-600 hover:bg-purple-500 text-white font-bold py-3 px-4 rounded-xl text-sm transition-all shadow-md"
          >
            Open storefront to book
          </Link>
        )}
      </div>
    </div>
  );
}

function ClaimOutcome({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="max-w-xl mx-auto px-4 py-10">
      <div className="bg-base-200 border border-base-300 rounded-2xl p-6 sm:p-8 space-y-4 text-base-content text-center">
        <h1 className="text-xl font-bold">{title}</h1>
        <p className="text-sm text-base-content/60">{detail}</p>
        <Link
          href="/book"
          className="inline-block bg-purple-600 hover:bg-purple-500 text-white font-bold py-2.5 px-5 rounded-xl text-sm transition-all"
        >
          Browse available slots
        </Link>
      </div>
    </div>
  );
}
