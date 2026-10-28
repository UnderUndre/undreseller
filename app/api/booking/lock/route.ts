import { NextRequest, NextResponse } from 'next/server';

/**
 * T051 / FR-530: Legacy /api/booking/lock deprecation shim.
 * Returns HTTP 308 Permanent Redirect to /api/booking, with Deprecation and Sunset headers.
 * Sunset date: 90 days post-deploy (2027-01-26).
 * Future release (≤006) will replace this with HTTP 410 Gone.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const url = new URL('/api/booking', req.url);
  const sunsetDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toUTCString();

  return NextResponse.redirect(url, {
    status: 308,
    headers: {
      'Deprecation': 'true',
      'Sunset': sunsetDate,
    },
  });
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  return POST(req);
}
