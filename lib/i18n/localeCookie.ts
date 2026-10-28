/**
 * Anonymous-web locale cookie helper (T043, FR-412 fallback when no tgId is
 * known). Lives in lib so route files only export HTTP handlers (Next.js
 * route export constraint).
 */

import { NextResponse } from 'next/server';
import { NEXT_LOCALE_COOKIE, isSupportedLocale } from './config';

export function localeCookieResponse(locale: string): NextResponse {
  const value = isSupportedLocale(locale) ? locale : null;
  const res = NextResponse.json({ locale: value });
  if (value) {
    res.cookies.set(NEXT_LOCALE_COOKIE, value, {
      httpOnly: false, // readable by client switcher
      sameSite: 'lax',
      path: '/',
      maxAge: 365 * 24 * 60 * 60,
    });
  }
  return res;
}
