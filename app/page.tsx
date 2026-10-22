import Link from 'next/link';
import { prisma } from '@/lib/db/prisma';
import { ItemCard, CatalogItem } from '@/components/catalog/ItemCard';
import { CartDrawer } from '@/components/catalog/CartDrawer';
import { shopConfig } from '@/config/shop.config';
import { listServices } from '@/lib/kernel/serviceService';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const [items, services, profiles, settings] = await Promise.all([
    prisma.item.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
    }),
    listServices({ activeOnly: true }),
    prisma.professionalProfile.findMany({
      where: {
        isPublished: true,
        staffMember: { active: true },
      },
      include: {
        staffMember: { select: { displayName: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.shopSettings.findUnique({ where: { id: 1 } }),
  ]);

  const businessName = settings?.businessName || shopConfig.businessName;
  const businessDescription = settings?.businessDescription || shopConfig.businessDescription;
  const publicAddress = settings?.businessServiceAddressPublic ? settings.businessServiceAddress : null;

  return (
    <div className="space-y-16 pb-24 text-white">
      {/* Business Branding Hero */}
      <div className="text-center max-w-3xl mx-auto pt-8 pb-4 space-y-4">
        {settings?.logoUrl && (
          <img
            src={settings.logoUrl}
            alt={businessName}
            className="w-20 h-20 mx-auto rounded-2xl object-cover mb-2 border border-gray-800 shadow-md"
          />
        )}
        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight">
          {businessName}
        </h1>
        <p className="text-base sm:text-lg text-gray-400 max-w-xl mx-auto">
          {businessDescription}
        </p>

        {publicAddress && (
          <p className="text-xs text-emerald-400 font-mono pt-1">
            📍 Studio Address: {publicAddress}
          </p>
        )}
      </div>

      {/* Bookable Services Section (003.1 Booking-First MVP) */}
      {services.length > 0 && (
        <div className="space-y-6">
          <div className="flex items-center justify-between border-b border-gray-800 pb-3">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Services & Appointments</h2>
              <p className="text-xs text-gray-400 pt-0.5">Choose a service to schedule a visit or outcall</p>
            </div>
            <span className="text-xs text-gray-400 font-mono bg-gray-900 px-2.5 py-1 rounded-full border border-gray-800">
              {services.length} offered
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {services.map((svc) => (
              <div
                key={svc.id}
                className="bg-gray-900/50 border border-gray-800 hover:border-blue-500/50 transition-all rounded-2xl p-6 flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex justify-between items-start gap-2">
                    <h3 className="font-semibold text-lg">{svc.title}</h3>
                    <span className="text-xs bg-gray-800 text-gray-300 px-2 py-0.5 rounded font-mono">
                      {svc.durationMin}m
                    </span>
                  </div>

                  {svc.description && (
                    <p className="text-xs text-gray-400 line-clamp-2 leading-relaxed">
                      {svc.description}
                    </p>
                  )}

                  <div className="pt-2 flex flex-wrap gap-2 text-xs">
                    {svc.inCallEnabled && (
                      <span className="bg-emerald-950/60 text-emerald-300 border border-emerald-800/60 px-2.5 py-1 rounded-md">
                        In-Studio {svc.inCallPricing ? `• ${svc.inCallPricing.formattedTotal}` : ''}
                      </span>
                    )}
                    {svc.outCallEnabled && (
                      <span className="bg-purple-950/60 text-purple-300 border border-purple-800/60 px-2.5 py-1 rounded-md">
                        Outcall {svc.outCallPricing ? `• ${svc.outCallPricing.formattedTotal}` : ''}
                      </span>
                    )}
                  </div>
                </div>

                <div className="pt-6">
                  <Link
                    href={`/book?serviceId=${svc.id}`}
                    className="block w-full text-center bg-blue-600 hover:bg-blue-500 text-white font-medium py-2.5 px-4 rounded-xl text-sm transition-colors shadow-sm"
                  >
                    Book Now
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Featured Professionals Team Section (US12) */}
      {profiles.length > 0 && (
        <div className="space-y-6">
          <div className="border-b border-gray-800 pb-3">
            <h2 className="text-2xl font-bold tracking-tight">Our Specialists</h2>
            <p className="text-xs text-gray-400 pt-0.5">Explore individual profiles and portfolios</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
            {profiles.map((p) => (
              <Link
                key={p.id}
                href={`/professionals/${p.slug}`}
                className="group bg-gray-900/40 border border-gray-800 hover:border-blue-500/50 rounded-2xl p-6 transition-all block text-center space-y-3"
              >
                {p.photoUrl ? (
                  <img
                    src={p.photoUrl}
                    alt={p.staffMember.displayName}
                    className="w-20 h-20 rounded-full mx-auto object-cover border-2 border-blue-500/30 group-hover:scale-105 transition-transform"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-blue-900/30 border-2 border-blue-500/30 mx-auto flex items-center justify-center text-2xl font-bold text-blue-400">
                    {p.staffMember.displayName.slice(0, 1)}
                  </div>
                )}
                <div>
                  <h4 className="font-semibold text-base group-hover:text-blue-400 transition-colors">
                    {p.staffMember.displayName}
                  </h4>
                  {p.headline && (
                    <p className="text-xs text-gray-400 pt-1 line-clamp-1">{p.headline}</p>
                  )}
                </div>
                <span className="inline-block text-xs text-blue-400 font-medium pt-1">
                  View Profile & Portfolio →
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Legacy Catalog & Mixed Cart Support */}
      <CartDrawer items={items as CatalogItem[]} />

      {items.length > 0 && (
        <div className="space-y-6 pt-6 border-t border-gray-800/80">
          <h2 className="text-xl font-bold tracking-tight">Store Catalog</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {items.map((item) => (
              <ItemCard key={item.id} item={item as CatalogItem} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
