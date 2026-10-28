import { randomBytes, scryptSync } from 'node:crypto';
import { prisma } from '@/lib/db/prisma';

jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    session: {
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn().mockResolvedValue({ id: 'sess-1' }),
    },
    auditEvent: { create: jest.fn().mockResolvedValue({ id: 'audit-1' }) },
  },
}));

import { emitAuditEvent } from '@/lib/security/staffAuth';

jest.mock('@/lib/security/staffAuth', () => ({
  emitAuditEvent: jest.fn().mockResolvedValue(undefined),
  authenticateAdmin: jest.fn(),
}));

import {
  getLockoutRemainingMs,
  signInStaff,
} from '@/lib/security/staffSignIn';

function makeStoredPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = scryptSync(password, salt, 64);
  return `${salt}:${derivedKey.toString('hex')}`;
}

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    name: 'Owner',
    email: 'owner@test.dev',
    accounts: [
      { providerId: 'credential', password: makeStoredPassword('correct-horse') },
    ],
    sessions: [],
    ...overrides,
  };
}

describe('Staff Web Sign-In (T017, FR-427)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('accepts valid scrypt credentials and creates a session (bootstrap-owner hash lineage)', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(makeUser());

    const result = await signInStaff({ email: 'Owner@test.dev', password: 'correct-horse' });

    expect(result.status).toBe('OK');
    if (result.status === 'OK') {
      expect(result.token).toMatch(/^[a-f0-9]{64}$/);
      expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
    }
    expect(prisma.session.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'user-1', token: expect.any(String) }),
      })
    );
  });

  it('rotates sessions: revokes all previous sessions before creating the new one', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(makeUser());

    await signInStaff({ email: 'owner@test.dev', password: 'correct-horse' });

    expect(prisma.session.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
    const deleteInvocation = (prisma.session.deleteMany as jest.Mock).mock.invocationCallOrder[0];
    const createInvocation = (prisma.session.create as jest.Mock).mock.invocationCallOrder[0];
    expect(deleteInvocation).toBeLessThan(createInvocation);
  });

  it('rejects wrong password with INVALID_CREDENTIALS and records a failed audit event', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(makeUser());

    const result = await signInStaff({ email: 'owner@test.dev', password: 'wrong' });

    expect(result.status).toBe('INVALID_CREDENTIALS');
    expect(emitAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'STAFF_SIGN_IN_FAILED' })
    );
  });

  it('rejects unknown email without revealing existence', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

    const result = await signInStaff({ email: 'ghost@test.dev', password: 'whatever' });
    expect(result.status).toBe('INVALID_CREDENTIALS');
  });

  it('verifies against scrypt in timing-safe mode: corrupted stored hash fails closed', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(
      makeUser({ accounts: [{ providerId: 'credential', password: 'garbage-no-separator' }] })
    );
    const result = await signInStaff({ email: 'owner@test.dev', password: 'correct-horse' });
    expect(result.status).toBe('INVALID_CREDENTIALS');
  });

  it('lockout: 5 consecutive failures lock the account for 15 minutes (staff-visible)', async () => {
    const email = 'lockout@test.dev';
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

    for (let i = 0; i < 5; i++) {
      await signInStaff({ email, password: 'nope' });
    }

    const remaining = getLockoutRemainingMs(email);
    expect(remaining).not.toBeNull();
    expect(remaining!).toBeGreaterThan(14 * 60 * 1000);
    expect(remaining!).toBeLessThanOrEqual(15 * 60 * 1000);

    // Even with correct credentials, locked account stays locked
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(
      makeUser({ email, accounts: [{ providerId: 'credential', password: makeStoredPassword('right') }] })
    );
    const locked = await signInStaff({ email, password: 'right' });
    expect(locked.status).toBe('LOCKED_OUT');
  });
});
