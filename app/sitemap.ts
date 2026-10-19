import { MetadataRoute } from 'next';
import { prisma } from '@/lib/db/prisma';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://undreseller.com';

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${baseUrl}/book`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.9,
    },
  ];

  try {
    const items = await prisma.item.findMany({
      where: { isActive: true },
      select: { slug: true, updatedAt: true },
    });

    const dynamicRoutes: MetadataRoute.Sitemap = items.map((item) => ({
      url: `${baseUrl}/catalog/${item.slug}`,
      lastModified: item.updatedAt,
      changeFrequency: 'weekly',
      priority: 0.8,
    }));

    return [...staticRoutes, ...dynamicRoutes];
  } catch {
    // Fallback gracefully during offline build prerendering
    return staticRoutes;
  }
}
