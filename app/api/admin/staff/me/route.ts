/**
 * GET /api/admin/staff/me (T064) — current staff actor context for admin UI.
 * Returns the session's role so the settings UI can hide OWNER-only sections;
 * the server remains the authority (client hiding is cosmetic only).
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateStaff } from '@/lib/security/staffAuth';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await authenticateStaff(req, 'PERFORMER');
  if (!auth.authenticated || !auth.actor) {
    return auth.errorResponse ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json(
    {
      actorId: auth.actor.actorId,
      role: auth.actor.actorRole,
      displayName: auth.actor.displayName,
    },
    { status: 200 }
  );
}
