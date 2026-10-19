import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { inngest } from '@/lib/jobs/inngest';
import { verifyWhatsAppSignature } from '@/lib/security/whatsappSignature';
import { RAW_BODY_CAP_BYTES, validateCanonicalPayload } from '@/lib/inbox/schemas';
import { logger } from '@/lib/telemetry/logger';
import { checkRateLimit } from '@/lib/security/rateLimiter';
import { Prisma } from '@prisma/client';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  const expectedToken = process.env.WHATSAPP_VERIFY_TOKEN || process.env.WHATSAPP_APP_SECRET;

  if (mode === 'subscribe' && token === expectedToken && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }

  return new NextResponse('Forbidden', { status: 403 });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rawBody = await req.text();

  if (Buffer.byteLength(rawBody, 'utf-8') > RAW_BODY_CAP_BYTES) {
    return new NextResponse('Payload Too Large', { status: 413 });
  }

  const signatureHeader = req.headers.get('x-hub-signature-256');
  if (!verifyWhatsAppSignature(rawBody, signatureHeader)) {
    logger.warn('Unauthorized WhatsApp webhook signature attempt');
    return new NextResponse('Unauthorized: invalid signature', { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return new NextResponse('Bad Request: malformed JSON', { status: 400 });
  }

  const entry = (body.entry as Array<Record<string, unknown>> | undefined)?.[0];
  const changes = (entry?.changes as Array<Record<string, unknown>> | undefined)?.[0];
  const value = changes?.value as Record<string, unknown> | undefined;
  const messages = value?.messages as Array<Record<string, unknown>> | undefined;
  const message = messages?.[0];

  if (!message) {
    return new NextResponse('EVENT_RECEIVED', { status: 200 });
  }

  const messageId = message.id as string;
  const fromPhone = message.from as string;
  const textObj = message.text as Record<string, unknown> | undefined;
  const messageText = textObj?.body as string | undefined;

  const rateCheck = checkRateLimit(`wa_${fromPhone}`, 10);
  if (!rateCheck.allowed) {
    return new NextResponse('Too Many Requests', { status: 429 });
  }

  const canonical = {
    version: 1 as const,
    kind: 'WHATSAPP_MESSAGE' as const,
    messageId: String(messageId),
    phone: String(fromPhone),
    text: messageText ? String(messageText).slice(0, 2000) : undefined,
  };

  const validation = validateCanonicalPayload(canonical);
  if (!validation.success) {
    logger.error('Invalid canonical whatsapp payload', { error: validation.error });
    return new NextResponse('Bad Request: schema validation failed', { status: 400 });
  }

  try {
    const inboxRow = await prisma.inboxEvent.create({
      data: {
        provider: 'WHATSAPP',
        eventId: String(messageId),
        kind: 'WHATSAPP_MESSAGE',
        payloadJson: validation.data as Prisma.InputJsonObject,
        status: 'PENDING',
      },
    });

    await inngest.send({
      name: 'whatsapp/message.received',
      data: {
        eventId: inboxRow.id,
      },
    });

    return new NextResponse('EVENT_RECEIVED', { status: 200 });
  } catch (err: unknown) {
    if (typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === 'P2002') {
      return new NextResponse('EVENT_RECEIVED (duplicate)', { status: 200 });
    }

    logger.error('Failed to enqueue WhatsApp event', { error: String(err) });
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
