import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function getDatabaseUrlWithPoolLimit(): string {
  const urlString = process.env.DATABASE_URL;
  if (!urlString) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  try {
    const url = new URL(urlString);
    if (!url.searchParams.has('connection_limit')) {
      url.searchParams.set('connection_limit', '10');
      return url.toString();
    }
  } catch {
    // If not a standard URL string, return as-is
  }
  return urlString;
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: {
      db: {
        url: getDatabaseUrlWithPoolLimit(),
      },
    },
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
