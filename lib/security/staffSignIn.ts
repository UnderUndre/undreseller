/**
 * Staff Web Sign-In Service (T017, FR-427, antigravity F2)
 * scrypt password verification against the existing Account hash
 * (bootstrap-owner lineage: `salt:derivedKeyHex`, N=16384 default params).
 * Session create in prisma.session; HttpOnly/Secure/SameSite cookie;
 * rotation on login (all previous sessions revoked). Break-glass
 * ADMIN_TOKEN path is untouched (resolveStaffSession keeps handling it).
 * Login rate limit + lockout: 5 fails → 15-minute lockout (in-memory, per instance).
 */

import { scryptSync, timingSafeEqual } from 'node:crypto';
import { randomBytes } from 'node:crypto';
import { prisma } from '@/lib/db/prisma';
import { emitAuditEvent } from './staffAuth';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const SESSION_COOKIE_NAME = 'session_token';

interface LockoutState {
  failedCount: number;
  lockedUntil: number | null;
}

/** In-memory lockout registry (single instance, ≤ ~20 staff — bounded). */
const lockoutRegistry = new Map<string, LockoutState>();

export function getLockoutState(email: string): LockoutState | undefined {
  return lockoutRegistry.get(email.toLowerCase());
}

function recordFailedAttempt(email: string): void {
  const key = email.toLowerCase();
  const state = lockoutRegistry.get(key) ?? { failedCount: 0, lockedUntil: null };
  state.failedCount += 1;
  if (state.failedCount >= MAX_FAILED_ATTEMPTS) {
    state.lockedUntil = Date.now() + LOCKOUT_MS;
    state.failedCount = 0;
  }
  lockoutRegistry.set(key, state);
}

function recordSuccessfulLogin(email: string): void {
  lockoutRegistry.delete(email.toLowerCase());
}

export type SignInResult =
  | { status: 'OK'; token: string; expiresAt: Date; displayName: string }
  | { status: 'INVALID_CREDENTIALS' }
  | { status: 'LOCKED_OUT'; retryAfterMs: number };

function verifyScryptPassword(password: string, stored: string): boolean {
  const [salt, keyHex] = stored.split(':');
  if (!salt || !keyHex) return false;
  try {
    const derived = scryptSync(password, salt, 64);
    const expected = Buffer.from(keyHex, 'hex');
    if (expected.length !== derived.length) return false;
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

export async function signInStaff(params: {
  email: string;
  password: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  actorIdForAudit?: string;
}): Promise<SignInResult> {
  const email = params.email.trim().toLowerCase();
  const state = getLockoutState(email);

  if (state?.lockedUntil && state.lockedUntil > Date.now()) {
    return { status: 'LOCKED_OUT', retryAfterMs: state.lockedUntil - Date.now() };
  }

  const user = await prisma.user.findUnique({
    where: { email },
    include: { accounts: true, sessions: true },
  });

  const passwordAccount = user?.accounts.find(
    (a) => a.providerId === 'credential' && a.password
  );

  if (!user || !passwordAccount?.password || !verifyScryptPassword(params.password, passwordAccount.password)) {
    recordFailedAttempt(email);
    await emitAuditEvent({
      action: 'STAFF_SIGN_IN_FAILED',
      actorId: user?.id ?? email,
      actorRole: null,
      aggregateType: 'USER',
      aggregateId: user?.id ?? email,
      reason: 'Invalid credentials',
      metadataJson: { userAgent: params.userAgent ?? null },
    });
    return { status: 'INVALID_CREDENTIALS' };
  }

  // Session rotation: revoke all previous sessions for this user (FR-427)
  await prisma.session.deleteMany({ where: { userId: user.id } });

  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.session.create({
    data: {
      token,
      userId: user.id,
      expiresAt,
      ipAddress: params.ipAddress ?? null,
      userAgent: params.userAgent ?? null,
    },
  });

  recordSuccessfulLogin(email);

  await emitAuditEvent({
    action: 'STAFF_SIGN_IN',
    actorId: user.id,
    actorRole: null,
    aggregateType: 'USER',
    aggregateId: user.id,
    reason: 'Web sign-in',
    metadataJson: { userAgent: params.userAgent ?? null },
  });

  return { status: 'OK', token, expiresAt, displayName: user.name };
}

/** Lockout is staff-visible (FR-427): returns remaining ms or null. */
export function getLockoutRemainingMs(email: string): number | null {
  const state = getLockoutState(email);
  if (state?.lockedUntil && state.lockedUntil > Date.now()) {
    return state.lockedUntil - Date.now();
  }
  return null;
}
