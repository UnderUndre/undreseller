import { notFound } from 'next/navigation';
import Link from 'next/link';
import { TgDeepLinkBook } from '@/components/booking/TgDeepLinkBook';
import { getPublicProfileBySlug } from '@/lib/kernel/professionalProfileService';
import { shopConfig } from '@/config/shop.config';

export const dynamic = 'force-dynamic';

export default async function ProfessionalPage({
  params,
}: {
  params: Promise<{ slug: string }> | { slug: string };
}) {
  const { slug } = await params;
  const profile = await getPublicProfileBySlug(slug);

  if (!profile) {
    notFound();
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-12 pb-24 text-white">
      {/* Back button */}
      <div>
        <Link
          href="/"
          className="inline-flex items-center text-sm text-gray-400 hover:text-white transition-colors"
        >
          ← Back to {shopConfig.businessName}
        </Link>
      </div>

      {/* Profile Header */}
      <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 bg-gray-900/60 border border-gray-800 rounded-2xl p-6 sm:p-8 backdrop-blur-sm">
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
            <p className="text-sm text-gray-300 leading-relaxed pt-2 whitespace-pre-line">
              {profile.biography}
            </p>
          )}
        </div>
      </div>

      {/* Services Section */}
      <div className="space-y-6">
        <div className="flex items-center justify-between border-b border-gray-800 pb-3">
          <h2 className="text-xl font-bold">Services & Appointments</h2>
          <span className="text-xs text-gray-400 font-mono">
            {profile.services.length} available
          </span>
        </div>

        {profile.services.length === 0 ? (
          <p className="text-sm text-gray-400 py-4">No active services currently listed.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {profile.services.map((svc) => (
              <div
                key={svc.id}
                className="bg-gray-900/40 border border-gray-800/80 hover:border-purple-500/50 transition-all rounded-xl p-5 flex flex-col justify-between"
              >
                <div className="space-y-2">
                  <div className="flex justify-between items-start gap-2">
                    <h3 className="font-semibold text-lg">{svc.title}</h3>
                    <span className="text-xs bg-gray-800 text-gray-300 px-2 py-1 rounded">
                      {svc.durationMin}m
                    </span>
                  </div>
                  {svc.description && (
                    <p className="text-xs text-gray-400 line-clamp-2">{svc.description}</p>
                  )}

                  {/* Pricing and modes */}
                  <div className="pt-2 flex flex-wrap gap-2 text-xs">
                    {svc.inCallEnabled && (
                      <span className="bg-green-900/60 text-green-300 border border-green-800/60 px-2 py-1 rounded">
                        In-Studio {svc.pricing?.inCallTotal ? `• ${svc.pricing.inCallTotal}` : ''}
                      </span>
                    )}
                    {svc.outCallEnabled && (
                      <span className="bg-purple-900/60 text-purple-300 border border-purple-800/60 px-2 py-1 rounded">
                        Outcall {svc.pricing?.outCallTotal ? `• ${svc.pricing.outCallTotal}` : ''}
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
                    Book Appointment
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
          <div className="flex items-center justify-between border-b border-gray-800 pb-3">
            <h2 className="text-xl font-bold">Portfolio Gallery</h2>
            <span className="text-xs text-gray-400 font-mono">
              {profile.portfolio.length} items
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {profile.portfolio.map((item) => (
              <div
                key={item.id}
                className="group relative overflow-hidden rounded-xl border border-gray-800 bg-gray-900/40"
              >
                <img
                  src={item.mediaUrl}
                  alt={item.title}
                  className="w-full h-48 object-cover group-hover:scale-105 transition-transform duration-300"
                />
                <div className="p-3 bg-gray-900/90 backdrop-blur-sm">
                  <h4 className="font-medium text-sm text-gray-200">{item.title}</h4>
                  {item.description && (
                    <p className="text-xs text-gray-400 pt-1 line-clamp-1">{item.description}</p>
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
