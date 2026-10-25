import { prisma } from '@/lib/db/prisma';

jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    userPreference: {
      upsert: jest.fn().mockResolvedValue({ tgId: 'tg-1', languageOverride: 'ru' }),
      findUnique: jest.fn().mockResolvedValue({ tgId: 'tg-1', languageOverride: 'ru' }),
    },
  },
}));

import { NextRequest } from 'next/server';
import { GET, POST, PUT } from '@/app/api/preferences/language/route';
import { localeCookieResponse } from '@/lib/i18n/localeCookie';
import { NEXT_LOCALE_COOKIE } from '@/lib/i18n/config';

function jsonReq(url: string, body: unknown, method: 'PUT' | 'POST'): NextRequest {
  return new NextRequest(url, {
    method,
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

describe('User Preference Language Override API (T043, FR-412)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('PUT upserts the language override for a tgId', async () => {
    const res = await PUT(jsonReq('http://localhost/api/preferences/language', { tgId: 'tg-1', languageOverride: 'ru' }, 'PUT'));
    expect(res.status).toBe(200);
    expect(prisma.userPreference.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tgId: 'tg-1' },
        update: { languageOverride: 'ru' },
      })
    );
  });

  it('PUT accepts null override (clears preference)', async () => {
    await PUT(jsonReq('http://localhost/api/preferences/language', { tgId: 'tg-1', languageOverride: null }, 'PUT'));
    expect(prisma.userPreference.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { languageOverride: null } })
    );
  });

  it('PUT rejects unsupported locales (uk is post-launch data)', async () => {
    const res = await PUT(jsonReq('http://localhost/api/preferences/language', { tgId: 'tg-1', languageOverride: 'uk' }, 'PUT'));
    expect(res.status).toBe(400);
  });

  it('GET returns override or null for unknown tgId', async () => {
    (prisma.userPreference.findUnique as jest.Mock).mockResolvedValue(null);
    const req = new NextRequest('http://localhost/api/preferences/language?tgId=nope');
    const res = await GET(req);
    const data = await res.json();
    expect(data.languageOverride).toBeNull();
  });

  it('POST sets the anonymous-web NEXT_LOCALE cookie (FR-412 fallback)', async () => {
    const res = await POST(jsonReq('http://localhost/api/preferences/language', { locale: 'ru' }, 'POST'));
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain(NEXT_LOCALE_COOKIE);
    expect(setCookie).toContain('ru');
  });

  it('localeCookieResponse rejects unsupported locales', async () => {
    const res = localeCookieResponse('de');
    const data = await res.json();
    expect(data.locale).toBeNull();
  });
});
