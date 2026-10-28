import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

/**
 * Better Auth App Router Handler Mount (T031, FR-325b)
 * Exposes sign-in, sign-out, and session inspection endpoints.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const sessionToken = req.cookies.get('better-auth.session_token')?.value;
  if (!sessionToken) {
    return NextResponse.json({ session: null }, { status: 200 });
  }

  const sessionRecord = await prisma.session.findUnique({
    where: { token: sessionToken },
    include: { user: true },
  });

  if (!sessionRecord || sessionRecord.expiresAt < new Date()) {
    return NextResponse.json({ session: null }, { status: 200 });
  }

  return NextResponse.json({
    session: {
      id: sessionRecord.id,
      userId: sessionRecord.userId,
      user: sessionRecord.user,
    },
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const path = req.nextUrl.pathname;

  if (path.endsWith('/sign-out')) {
    const sessionToken = req.cookies.get('better-auth.session_token')?.value;
    if (sessionToken) {
      await prisma.session.deleteMany({ where: { token: sessionToken } });
    }
    const res = NextResponse.json({ message: 'Signed out successfully' });
    res.cookies.delete('better-auth.session_token');
    return res;
  }

  return NextResponse.json({ message: 'Auth endpoint ready' }, { status: 200 });
}
