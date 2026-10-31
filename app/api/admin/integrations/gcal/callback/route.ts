/**
 * T020 (FR-601): OAuth callback — one-time state validation, code exchange,
 * refresh token into the secret vault, per-resource credential upsert.
 */

import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { authenticateStaff } from '@/lib/security/staffAuth';
import { emitAuditEvent } from '@/lib/security/staffAuth';
import { consumeOAuthState } from '@/lib/integrations/oauthState';
import { serializeCredentialPayload } from '@/lib/integrations/gcalClient';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await authenticateStaff(req, 'OWNER');
  if (!auth.authenticated || !auth.actor) {
    return auth.errorResponse ?? NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');
  const error = req.nextUrl.searchParams.get('error');

  if (error) {
    return NextResponse.redirect(`${req.nextUrl.origin}/admin/settings?gcal=consent_denied`);
  }
  if (!code || !state) {
    return NextResponse.redirect(`${req.nextUrl.origin}/admin/settings?gcal=missing_params`);
  }

  // One-time CSRF state (F1/T020): mismatch → 403-ish redirect
  const stateData = consumeOAuthState(state);
  if (!stateData) {
    return NextResponse.redirect(`${req.nextUrl.origin}/admin/settings?gcal=state_mismatch`);
  }

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: 'Google OAuth is not configured' }, { status: 503 });
  }

  const oauthClient = new google.auth.OAuth2(clientId, clientSecret);
  const redirectUri = `${req.nextUrl.origin}/api/admin/integrations/gcal/callback`;

  try {
    const { tokens } = await oauthClient.getToken({ code, redirect_uri: redirectUri });
    if (!tokens.refresh_token) {
      // prompt=consent guarantees refresh_token; absence = re-auth anomaly
      return NextResponse.redirect(`${req.nextUrl.origin}/admin/settings?gcal=no_refresh_token`);
    }

    // Discover the user's primary calendar id (fixed at connect time)
    oauthClient.setCredentials(tokens);
    const calendar = google.calendar({ version: 'v3', auth: oauthClient });
    const primary = await calendar.calendars.get({ calendarId: 'primary' });

    await prismaUpsertCredential({
      resourceId: stateData.resourceId,
      connectedByStaffId: stateData.connectedByStaffId,
      encryptedPayload: serializeCredentialPayload({
        refreshToken: tokens.refresh_token,
        accessToken: tokens.access_token ?? undefined,
        calendarId: primary.data.id ?? 'primary',
      }),
    });

    await emitAuditEvent({
      action: 'GCAL_CONNECTED',
      actorId: stateData.connectedByStaffId,
      actorRole: 'OWNER',
      aggregateType: 'INTEGRATION_CREDENTIAL',
      aggregateId: stateData.resourceId ?? 'default_master',
      metadataJson: { resourceId: stateData.resourceId },
    });

    return NextResponse.redirect(`${req.nextUrl.origin}/admin/settings?gcal=connected`);
  } catch {
    return NextResponse.redirect(`${req.nextUrl.origin}/admin/settings?gcal=token_exchange_failed`);
  }
}

async function prismaUpsertCredential(input: {
  resourceId: string | null;
  connectedByStaffId: string;
  encryptedPayload: string;
}): Promise<void> {
  const { prisma } = await import('@/lib/db/prisma');
  const existing = await prisma.integrationCredential.findFirst({
    where: { provider: 'GOOGLE_CALENDAR', resourceId: input.resourceId },
  });
  if (existing) {
    // Repeat connect → upsert per-resource (T020 contract test row)
    await prisma.integrationCredential.update({
      where: { id: existing.id },
      data: {
        encryptedPayload: input.encryptedPayload,
        status: 'CONNECTED',
        lastError: null,
        connectedByStaffId: input.connectedByStaffId,
      },
    });
  } else {
    await prisma.integrationCredential.create({
      data: {
        provider: 'GOOGLE_CALENDAR',
        resourceId: input.resourceId,
        encryptedPayload: input.encryptedPayload,
        status: 'CONNECTED',
        connectedByStaffId: input.connectedByStaffId,
      },
    });
  }
}
