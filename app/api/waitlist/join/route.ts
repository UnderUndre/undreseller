/**
 * Waitlist join API (T072, US5, FR-419).
 * Join is restricted to Telegram-identified customers at launch (offers are
 * Telegram-only; contact-only join would be a silent dead-end). Thin controller
 * over joinWaitlist (FR-435) — reason → HTTP status mapping below.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyTelegramInitData } from '@/lib/security/initData';
import { joinWaitlist } from '@/lib/waitlist/waitlistService';
import { logger } from '@/lib/telemetry/logger';

const JoinSchema = z.object({
  serviceId: z.string().trim().min(1).max(64).optional().nullable(),
  windowStartAt: z.string().datetime(),
  windowEndAt: z.string().datetime(),
  contact: z.string().trim().max(200).optional().nullable(),
  initData: z.string().trim().min(1).optional().nullable(),
});

export type JoinFailureReason =
  | 'VALIDATION'
  | 'TELEGRAM_REQUIRED'
  | 'UNAUTHORIZED_INIT_DATA'
  | 'WINDOW_TOO_LONG'
  | 'TOO_MANY_ACTIVE'
  | 'DUPLICATE_ACTIVE'
  | 'ITEM_NOT_FOUND';

/** Pure reason → HTTP status/payload mapping (unit-tested). */
export function joinFailurePayload(reason: JoinFailureReason): { status: number; error: string } {
  switch (reason) {
    case 'TOO_MANY_ACTIVE':
      return {
        status: 429,
        error: 'You already have the maximum number of active waitlist entries (10). Cancel one before joining again.',
      };
    case 'DUPLICATE_ACTIVE':
      return {
        status: 409,
        error: 'You are already on the waitlist for this service in the selected window.',
      };
    case 'WINDOW_TOO_LONG':
      return { status: 400, error: 'The waitlist window cannot exceed 30 days.' };
    case 'ITEM_NOT_FOUND':
      return { status: 404, error: 'Service not found or unavailable.' };
    case 'UNAUTHORIZED_INIT_DATA':
      return { status: 401, error: 'Invalid Telegram session. Re-open the Mini App and try again.' };
    case 'TELEGRAM_REQUIRED':
      return {
        status: 400,
        error: 'Joining the waitlist is available via Telegram only. Open the bot Mini App to join — offers arrive in Telegram.',
      };
    case 'VALIDATION':
      return { status: 400, error: 'Invalid waitlist join payload.' };
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    const { status, error } = joinFailurePayload('VALIDATION');
    return NextResponse.json({ error, reason: 'VALIDATION' }, { status });
  }

  const parsed = JoinSchema.safeParse(body);
  if (!parsed.success) {
    const { status, error } = joinFailurePayload('VALIDATION');
    return NextResponse.json({ error, reason: 'VALIDATION' }, { status });
  }

  const { serviceId, windowStartAt, windowEndAt, contact, initData } = parsed.data;

  // FR-419: Telegram-identified customers only at launch.
  if (!initData) {
    const { status, error } = joinFailurePayload('TELEGRAM_REQUIRED');
    return NextResponse.json({ error, reason: 'TELEGRAM_REQUIRED' }, { status });
  }
  const verified = verifyTelegramInitData(initData);
  if (!verified.valid || !verified.telegramUserId) {
    logger.warn('[WAITLIST_JOIN_REJECTED]', { reason: 'UNAUTHORIZED_INIT_DATA' });
    const { status, error } = joinFailurePayload('UNAUTHORIZED_INIT_DATA');
    return NextResponse.json({ error, reason: 'UNAUTHORIZED_INIT_DATA' }, { status });
  }

  const result = await joinWaitlist({
    customerTgId: verified.telegramUserId,
    customerContact: contact ?? null,
    serviceId: serviceId ?? null,
    windowStartAt: new Date(windowStartAt),
    windowEndAt: new Date(windowEndAt),
  });

  if (!result.ok) {
    const { status, error } = joinFailurePayload(result.reason);
    return NextResponse.json({ error, reason: result.reason }, { status });
  }

  logger.info('[WAITLIST_JOIN_API]', { entryId: result.entryId });
  return NextResponse.json({ ok: true, entryId: result.entryId });
}
