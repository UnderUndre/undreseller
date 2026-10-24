import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { SESSION_COOKIE_NAME, signInStaff } from '@/lib/security/staffSignIn';

const signInSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(1).max(200),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = signInSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const result = await signInStaff({
    email: parsed.data.email,
    password: parsed.data.password,
    ipAddress: req.headers.get('x-forwarded-for'),
    userAgent: req.headers.get('user-agent'),
  });

  if (result.status === 'LOCKED_OUT') {
    const retryAfterSec = Math.ceil(result.retryAfterMs / 1000);
    return NextResponse.json(
      {
        error: 'Account temporarily locked after repeated failed attempts',
        retryAfterSeconds: retryAfterSec,
      },
      { status: 429, headers: { 'Retry-After': String(retryAfterSec) } }
    );
  }

  if (result.status === 'INVALID_CREDENTIALS') {
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
  }

  const res = NextResponse.json({
    status: 'OK',
    displayName: result.displayName,
    expiresAt: result.expiresAt.toISOString(),
  });
  res.cookies.set(SESSION_COOKIE_NAME, result.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: result.expiresAt,
  });
  return res;
}
