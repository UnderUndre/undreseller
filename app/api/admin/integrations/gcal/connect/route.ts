/**
 * T020 (FR-601): OWNER-only Google Calendar OAuth connect — redirect to
 * consent. Strictly OWNER (OPERATOR/PERFORMER → 403, Q7 canon).
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateStaff } from '@/lib/security/staffAuth';
import { createOAuthState } from '@/lib/integrations/oauthState';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await authenticateStaff(req, 'OWNER');
  if (!auth.authenticated || !auth.actor) {
    return auth.errorResponse ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: 'Google OAuth is not configured' }, { status: 503 });
  }

  // resourceId from query; empty = instance-wide "default_master" (solo mode)
  const resourceIdParam = req.nextUrl.searchParams.get('resourceId');
  const resourceId = resourceIdParam && resourceIdParam !== 'default_master' ? resourceIdParam : null;

  const state = createOAuthState(resourceId, auth.actor.actorId);
  const redirectUri = `${req.nextUrl.origin}/api/admin/integrations/gcal/callback`;
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly');
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('state', state);

  return NextResponse.redirect(url.toString());
}
