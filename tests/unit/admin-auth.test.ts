import { NextRequest } from 'next/server';
import { authenticateAdmin } from '@/lib/security/adminAuth';
import { validateGreeting } from '@/config/shop.config';
import { Prisma } from '@prisma/client';

describe('Admin Authentication & Scope (T-007, T-008)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      ADMIN_TOKEN: 'token_new_primary,token_old_secondary',
      ADMIN_OLD_TOKEN_EXPIRES_AT: new Date(Date.now() + 1000 * 3600).toISOString(), // 1 hour grace
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('accepts valid new primary token', () => {
    const req = new NextRequest('http://localhost/api/admin/items', {
      headers: { authorization: 'Bearer token_new_primary' },
    });
    const auth = authenticateAdmin(req);
    expect(auth.authenticated).toBe(true);
  });

  it('accepts old token within grace period', () => {
    const req = new NextRequest('http://localhost/api/admin/items', {
      headers: { authorization: 'Bearer token_old_secondary' },
    });
    const auth = authenticateAdmin(req);
    expect(auth.authenticated).toBe(true);
  });

  it('rejects old token after grace period has expired', () => {
    process.env.ADMIN_OLD_TOKEN_EXPIRES_AT = new Date(Date.now() - 1000).toISOString();
    const req = new NextRequest('http://localhost/api/admin/items', {
      headers: { authorization: 'Bearer token_old_secondary' },
    });
    const auth = authenticateAdmin(req);
    expect(auth.authenticated).toBe(false);
  });

  it('rejects missing or wrong token', () => {
    const reqNoHeader = new NextRequest('http://localhost/api/admin/items');
    expect(authenticateAdmin(reqNoHeader).authenticated).toBe(false);

    const reqWrong = new NextRequest('http://localhost/api/admin/items', {
      headers: { authorization: 'Bearer wrong_token' },
    });
    expect(authenticateAdmin(reqWrong).authenticated).toBe(false);
  });

  it('admin-auth scope test: asserts no User/Account/Session/OAuth models exist in Prisma Client', () => {
    const prismaModelNames = Object.keys(Prisma.ModelName);
    const forbiddenModels = ['User', 'Account', 'Session', 'Team', 'Organization', 'Membership', 'Role'];

    for (const forbidden of forbiddenModels) {
      expect(prismaModelNames).not.toContain(forbidden);
    }
  });

  it('sanitizes ShopSettings.greeting and rejects HTML/scripts or > 500 chars (T-008)', () => {
    // Valid plain text & Telegram markdown
    const valid = validateGreeting('👋 Welcome! Check out *our products* and _services_.');
    expect(valid.success).toBe(true);

    // Reject HTML/script tags
    const htmlAttempt = validateGreeting('Hello <script>alert(1)</script>');
    expect(htmlAttempt.success).toBe(false);
    expect(htmlAttempt.error).toMatch(/HTML\/script tags are strictly prohibited/);

    // Reject oversized text (> 500 chars)
    const longText = 'A'.repeat(501);
    const oversizedAttempt = validateGreeting(longText);
    expect(oversizedAttempt.success).toBe(false);
    expect(oversizedAttempt.error).toMatch(/cannot exceed 500 characters/);
  });
});
