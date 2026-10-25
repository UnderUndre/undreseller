/**
 * User Preference API (T043, FR-412)
 * Customer language override persistence: upsert into UserPreference by tgId.
 * Anonymous web fallback rides the NEXT_LOCALE cookie (no account required).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { I18N_LOCALES } from '@/lib/i18n/config';
import { localeCookieResponse } from '@/lib/i18n/localeCookie';

const putSchema = z.object({
  tgId: z.string().min(1).max(100),
  languageOverride: z.enum(['ru', 'en', '']).nullable(),
});

export async function PUT(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const override = parsed.data.languageOverride === '' ? null : parsed.data.languageOverride;

  const preference = await prisma.userPreference.upsert({
    where: { tgId: parsed.data.tgId },
    update: { languageOverride: override },
    create: { tgId: parsed.data.tgId, languageOverride: override },
  });

  return NextResponse.json({
    tgId: preference.tgId,
    languageOverride: preference.languageOverride,
  });
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const tgId = req.nextUrl.searchParams.get('tgId');
  if (!tgId) {
    return NextResponse.json({ error: 'Missing required query parameter: tgId' }, { status: 400 });
  }

  const preference = await prisma.userPreference.findUnique({ where: { tgId } });
  return NextResponse.json({
    tgId,
    languageOverride: preference?.languageOverride ?? null,
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const { locale } = (body ?? {}) as { locale?: string };
  if (!locale || !(I18N_LOCALES as readonly string[]).includes(locale)) {
    return NextResponse.json({ error: 'Unsupported locale' }, { status: 400 });
  }
  return localeCookieResponse(locale);
}
