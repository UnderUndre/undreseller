import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/telemetry/logger';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  try {
    // Health check executes raw SELECT 1 to verify database reachability
    await prisma.$queryRaw`SELECT 1`;

    return NextResponse.json(
      {
        status: 'ok',
        uptimeSeconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    logger.error('Healthcheck database ping failed', { error: String(err) });
    return NextResponse.json(
      {
        status: 'error',
        message: 'Database connection check failed',
      },
      { status: 503 }
    );
  }
}
