import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { logger } from '../telemetry/logger';

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, 'utf-8'), Buffer.from(b, 'utf-8'));
}

export interface AdminAuthResult {
  authenticated: boolean;
  errorResponse?: NextResponse;
}

export function authenticateAdmin(req: NextRequest): AdminAuthResult {
  const adminTokenEnv = process.env.ADMIN_TOKEN;
  if (!adminTokenEnv || adminTokenEnv.trim() === '') {
    logger.warn('ADMIN_TOKEN not configured; failing closed');
    return {
      authenticated: false,
      errorResponse: NextResponse.json({ error: 'Unauthorized: admin token unconfigured' }, { status: 401 }),
    };
  }

  const authHeader = req.headers.get('authorization') || '';
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return {
      authenticated: false,
      errorResponse: NextResponse.json({ error: 'Unauthorized: missing Bearer token' }, { status: 401 }),
    };
  }

  const providedToken = authHeader.slice(7).trim();
  const tokens = adminTokenEnv.split(',').map((t) => t.trim());
  const newToken = tokens[0];
  const oldToken = tokens.length > 1 ? tokens[1] : undefined;

  // 1. Check against primary token
  if (newToken && safeCompare(providedToken, newToken)) {
    return { authenticated: true };
  }

  // 2. Check against old token if within grace period
  if (oldToken && safeCompare(providedToken, oldToken)) {
    const expiresAtStr = process.env.ADMIN_OLD_TOKEN_EXPIRES_AT;
    if (!expiresAtStr) {
      logger.warn('[OLD_ADMIN_TOKEN_REJECTED] ADMIN_OLD_TOKEN_EXPIRES_AT unset');
      return {
        authenticated: false,
        errorResponse: NextResponse.json({ error: 'Unauthorized: old token expired' }, { status: 401 }),
      };
    }

    const expiresAt = new Date(expiresAtStr).getTime();
    if (isNaN(expiresAt) || Date.now() > expiresAt) {
      logger.warn('[OLD_ADMIN_TOKEN_REJECTED] Old admin token grace period expired');
      return {
        authenticated: false,
        errorResponse: NextResponse.json({ error: 'Unauthorized: old token expired' }, { status: 401 }),
      };
    }

    logger.warn('[OLD_ADMIN_TOKEN_USED]', { path: req.nextUrl.pathname });
    return { authenticated: true };
  }

  return {
    authenticated: false,
    errorResponse: NextResponse.json({ error: 'Unauthorized: invalid token' }, { status: 401 }),
  };
}
