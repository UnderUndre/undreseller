import { notFound } from 'next/navigation';
import Link from 'next/link';
import { TgDeepLinkBook } from '@/components/booking/TgDeepLinkBook';
import { getPublicProfileBySlug } from '@/lib/kernel/professionalProfileService';
import { shopConfig } from '@/config/shop.config';
import { getTranslations } from 'next-intl/server';

export const dynamic = 'force-dynamic';

export default async function ProfessionalPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const profile = await getPublicProfileBySlug(slug);

  if (!profile) {
    notFound();
  }

  // T040 (FR-411): chrome labels only; profile content stays authored (FR-414).
  const t = await getTranslations('web.professionals');

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-12 pb-24 text-base-content">
      {/* Back button */}
      <div>
        <Link
          href="/"
          className="inline-flex items-center text-sm text-base-content/60 hover:text-base-content transition-colors"
        >
          {t('backTo', { businessName: shopConfig.businessName })}
        </Link>
      </div>

      {/* Profile Header */}
      <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 bg-base-200/60 border border-base-300 rounded-2xl p-6 sm:p-8 backdrop-blur-sm">
        {profile.photoUrl ? (
          <img
            src={profile.photoUrl}
            alt={profile.displayName}
            className="w-28 h-28 sm:w-32 sm:h-32 rounded-full object-cover border-2 border-purple-500/40 shadow-lg"
          />
        ) : (
          <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-full bg-purple-600/20 border-2 border-purple-500/40 flex items-center justify-center text-3xl font-bold text-purple-400">
            {profile.displayName.slice(0, 1).toUpperCase()}
          </div>
        )}

        <div className="text-center sm:text-left space-y-2 flex-1">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            {profile.displayName}
          </h1>
          {profile.headline && (
            <p className="text-base text-purple-400 font-medium">{profile.headline}</p>
          )}
          {profile.biography && (
            <p className="text-sm text-base-content/80 leading-relaxed pt-2 whitespace-pre-line">
              {profile.biography}
            </p>
          )}
        </div>
      </div>

      {/* Services Section */}
      <div className="space-y-6">
        <div className="flex items-center justify-between border-b border-base-300 pb-3">
          <h2 className="text-xl font-bold">{t('servicesHeading')}</h2>
          <span className="text-xs text-base-content/60 font-mono">
            {t('available', { count: profile.services.length })}
          </span>
        </div>

        {profile.services.length === 0 ? (
          <p className="text-sm text-base-content/60 py-4">{t('noServices')}</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {profile.services.map((svc) => (
              <div
                key={svc.id}
                className="bg-base-200/40 border border-base-300/80 hover:border-purple-500/50 transition-all rounded-xl p-5 flex flex-col justify-between"
              >
                <div className="space-y-2">
                  <div className="flex justify-between items-start gap-2">
                    <h3 className="font-semibold text-lg">{svc.title}</h3>
                    <span className="text-xs bg-base-300 text-base-content/80 px-2 py-1 rounded">
                      {t('duration', { minutes: svc.durationMin })}
                    </span>
                  </div>
                  {svc.description && (
                    <p className="text-xs text-base-content/60 line-clamp-2">{svc.description}</p>
                  )}

                  {/* Pricing and modes */}
                  <div className="pt-2 flex flex-wrap gap-2 text-xs">
                    {svc.inCallEnabled && (
                      <span className="bg-green-900/60 text-green-300 border border-green-800/60 px-2 py-1 rounded">
                        {t('inStudio', { price: svc.pricing?.inCallTotal ? `• ${svc.pricing.inCallTotal}` : '' })}
                      </span>
                    )}
                    {svc.outCallEnabled && (
                      <span className="bg-purple-900/60 text-purple-300 border border-purple-800/60 px-2 py-1 rounded">
                        {t('outcall', { price: svc.pricing?.outCallTotal ? `• ${svc.pricing.outCallTotal}` : '' })}
                      </span>
                    )}
                  </div>
                </div>

                <div className="pt-5">
                  {/* T053/FR-418: tg:// deep link with startapp inside Telegram; /book on web */}
                  <TgDeepLinkBook
                    serviceId={svc.id}
                    performerSlug={profile.slug}
                    className="block w-full text-center bg-purple-600 hover:bg-purple-500 text-white font-medium py-2 px-4 rounded-lg text-sm transition-colors shadow-sm"
                  >
                    {t('bookAppointment')}
                  </TgDeepLinkBook>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Portfolio Gallery */}
      {profile.portfolio.length > 0 && (
        <div className="space-y-6">
          <div className="flex items-center justify-between border-b border-base-300 pb-3">
            <h2 className="text-xl font-bold">{t('portfolioHeading')}</h2>
            <span className="text-xs text-base-content/60 font-mono">
              {t('items', { count: profile.portfolio.length })}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {profile.portfolio.map((item) => (
              <div
                key={item.id}
                className="group relative overflow-hidden rounded-xl border border-base-300 bg-base-200/40"
              >
                <img
                  src={item.mediaUrl}
                  alt={item.title}
                  className="w-full h-48 object-cover group-hover:scale-105 transition-transform duration-300"
                />
                <div className="p-3 bg-base-200/90 backdrop-blur-sm">
                  <h4 className="font-medium text-sm text-base-content/90">{item.title}</h4>
                  {item.description && (
                    <p className="text-xs text-base-content/60 pt-1 line-clamp-1">{item.description}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
