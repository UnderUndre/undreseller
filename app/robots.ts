import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://undreseller.com';

  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/catalog/', '/book'],
        disallow: ['/api/admin/', '/api/bot/', '/api/inngest/', '/api/payments/'],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
