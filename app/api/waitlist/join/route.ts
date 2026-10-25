/**
 * Waitlist join API (T072, US5, FR-419).
 * Join is restricted to Telegram-identified customers at launch (offers are
 * Telegram-only; contact-only join would be a silent dead-end). Thin controller
 * over joinWaitlist (FR-435) — reason → HTTP status mapping below.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyTelegramInitData } from '@/lib/security/initData';
import {
  joinFailurePayload,
  type JoinFailureReason,
} from '@/lib/waitlist/joinPayload';
import { joinWaitlist } from '@/lib/waitlist/waitlistService';
import { logger } from '@/lib/telemetry/logger';

const JoinSchema = z.object({
  serviceId: z.string().trim().min(1).max(64).optional().nullable(),
  windowStartAt: z.string().datetime(),
  windowEndAt: z.string().datetime(),
  contact: z.string().trim().max(200).optional().nullable(),
  initData: z.string().trim().min(1).optional().nullable(),
});

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
