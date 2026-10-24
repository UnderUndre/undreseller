/**
 * Staff Authentication & Session Resolution (FR-325a, FR-325b)
 * Standards: NIST SP 800-218 SSDF & ISO/IEC/IEEE 12207:2017
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../db/prisma';
import { logger } from '../telemetry/logger';
import { authenticateAdmin } from './adminAuth';
import { Prisma } from '@prisma/client';
import { StaffActorContext, StaffRole, hasMinimumRole } from './staffRbac';

// PII Sanitization for Audit Events (INV-010)
const PII_KEYS = new Set([
  'password',
  'initialpassword',
  'token',
  'cancellationtoken',
  'email',
  'phone',
  'customerphone',
  'customeremail',
  'customernotes',
  'serviceaddress',
  'serviceaddresssnapshot',
  'address',
]);

/**
 * T092/FR-428: redacts PII from free-text fields (audit reasons) BEFORE
 * persistence — emails, phone numbers and card-like sequences never land in
 * the immutable audit log.
 */
export function redactFreeText(text: string | null | undefined): string | null {
  if (!text) return null;
  return (
    text
      // PAN before phone: 13-16 digit groups would otherwise match the phone rule
      .replace(/\b(?:\d[ -]*?){13,16}\b/g, '[REDACTED_PAN]')
      .replace(/[\w.+-]+@[\w-]+\.[\w.-]{2,}/g, '[REDACTED_EMAIL]')
      .replace(/(\+?\d[\d\s()-]{8,}\d)/g, '[REDACTED_PHONE]')
  );
}

export function sanitizeMetadata(metadata: unknown): Record<string, unknown> {
  if (!metadata || typeof metadata !== 'object') return {};
  const clean: Record<string, unknown> = {};

  for (const [key, val] of Object.entries(metadata)) {
    const lowerKey = key.toLowerCase();
    if (PII_KEYS.has(lowerKey)) {
      clean[key] = '[REDACTED]';
    } else if (val && typeof val === 'object' && !Array.isArray(val)) {
      clean[key] = sanitizeMetadata(val);
    } else {
      clean[key] = val;
    }
  }

  return clean;
}

/**
 * Emits an immutable, PII-sanitized AuditEvent to the database.
 */
export async function emitAuditEvent(params: {
  action: string;
  actorId: string;
  actorRole?: StaffRole | null;
  aggregateType: string;
  aggregateId: string;
  reason?: string | null;
  metadataJson?: Record<string, unknown>;
}): Promise<void> {
  try {
    const sanitizedMeta = sanitizeMetadata(params.metadataJson || {});
    await prisma.auditEvent.create({
      data: {
        action: params.action,
        actorId: params.actorId,
        actorRole: params.actorRole || null,
        aggregateType: params.aggregateType,
        aggregateId: params.aggregateId,
        reason: redactFreeText(params.reason)?.slice(0, 500) ?? null,
        metadataJson: sanitizedMeta as Prisma.InputJsonValue,
      },
    });
  } catch (err: unknown) {
    logger.error('Failed to persist AuditEvent', {
      action: params.action,
      error: String(err),
    });
  }
}

/**
 * Resolves an authenticated staff actor context from session cookies or break-glass ADMIN_TOKEN.
 */
export async function resolveStaffSession(
  req: NextRequest
): Promise<StaffActorContext | null> {
  // 1. Check for break-glass ADMIN_TOKEN in Authorization header
  const authHeader = req.headers.get('authorization') || '';
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    const adminCheck = authenticateAdmin(req);
    if (adminCheck.authenticated) {
      logger.warn('[BREAK_GLASS_ADMIN_TOKEN_USED]', { path: req.nextUrl.pathname });
      return {
        actorId: 'BREAK_GLASS_ADMIN_TOKEN',
        actorRole: 'OWNER',
        displayName: 'Emergency Break-Glass Operator',
        resourceId: null,
        sessionId: undefined,
        isBreakGlass: true,
      };
    }
  }

  // 2. Extract session token from cookie or header
  const sessionToken =
    req.cookies.get('better-auth.session_token')?.value ||
    req.cookies.get('session_token')?.value ||
    (authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : null);

  if (!sessionToken) {
    return null;
  }

  try {
    // 3. Query session from database
    const sessionRecord = await prisma.session.findUnique({
      where: { token: sessionToken },
      include: {
        user: true,
      },
    });

    if (!sessionRecord || sessionRecord.expiresAt < new Date()) {
      return null;
    }

    // 4. Map auth user to StaffMember
    const staffMember = await prisma.staffMember.findUnique({
      where: { authUserId: sessionRecord.userId },
    });

    if (!staffMember || !staffMember.active) {
      return null;
    }

    return {
      actorId: staffMember.id,
      actorRole: staffMember.role as StaffRole,
      displayName: staffMember.displayName,
      resourceId: staffMember.resourceId,
      sessionId: sessionRecord.id,
      isBreakGlass: false,
    };
  } catch (err: unknown) {
    logger.error('Error resolving staff session', { error: String(err) });
    return null;
  }
}

/**
 * Authenticates request for staff routes, checking minimum required role rank.
 */
export async function authenticateStaff(
  req: NextRequest,
  minRole: StaffRole = 'PERFORMER'
): Promise<{
  authenticated: boolean;
  actor?: StaffActorContext;
  errorResponse?: NextResponse;
}> {
  const actor = await resolveStaffSession(req);

  if (!actor) {
    return {
      authenticated: false,
      errorResponse: NextResponse.json(
        { error: 'Unauthorized: valid staff session or break-glass token required' },
        { status: 401 }
      ),
    };
  }

  if (!hasMinimumRole(actor.actorRole, minRole)) {
    return {
      authenticated: false,
      errorResponse: NextResponse.json(
        {
          error: `Forbidden: requires ${minRole} privilege, current role is ${actor.actorRole}`,
        },
        { status: 403 }
      ),
    };
  }

  return { authenticated: true, actor };
}
