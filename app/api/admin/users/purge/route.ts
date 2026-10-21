import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { authenticateAdmin } from '@/lib/security/adminAuth';
import { logger } from '@/lib/telemetry/logger';
import { enqueueStaffMessageRedaction } from '@/lib/bot/staffBot';
import { Prisma } from '@prisma/client';

const purgeUserSchema = z
  .object({
    customerTgId: z.string().trim().min(1).optional(),
    phone: z.string().trim().min(1).optional(),
  })
  .refine((data) => data.customerTgId || data.phone, {
    message: 'Either customerTgId or phone must be provided for user erasure',
  });

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = authenticateAdmin(req);
  if (!auth.authenticated) {
    return auth.errorResponse!;
  }

  try {
    const body = await req.json();
    const parsed = purgeUserSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
    }

    const { customerTgId, phone } = parsed.data;

    const orderWhere: Prisma.OrderWhereInput = {
      OR: [
        ...(customerTgId ? [{ customerTgId }] : []),
        ...(phone ? [{ customerPhone: phone }] : []),
      ],
    };

    const matchingOrders = await prisma.order.findMany({
      where: orderWhere,
      select: {
        id: true,
        orderNumber: true,
        staffChatId: true,
        staffMessageId: true,
      },
    });

    const result = await prisma.$transaction(async (tx) => {
      // 1. Scrub Order records (including customerNotes per FR-020 / NFR-004)
      const scrubbedOrders = await tx.order.updateMany({
        where: orderWhere,
        data: {
          customerName: null,
          customerPhone: null,
          customerEmail: null,
          customerTgId: null,
          customerNotes: null,
        },
      });

      // 2. Scrub MessengerContact records
      const contactWhere: Prisma.MessengerContactWhereInput = {
        OR: [
          ...(customerTgId ? [{ platform: 'TELEGRAM' as const, externalId: customerTgId }] : []),
          ...(phone ? [{ platform: 'WHATSAPP' as const, externalId: phone }] : []),
        ],
      };

      const scrubbedContacts = await tx.messengerContact.deleteMany({
        where: contactWhere,
      });

      // 3. Scrub matching canonical fields in InboxEvent.payloadJson
      const inboxEvents = await tx.inboxEvent.findMany({
        where: {
          status: { in: ['SENT', 'FAILED'] },
        },
      });

      let scrubbedInboxCount = 0;
      for (const ev of inboxEvents) {
        const payload = ev.payloadJson as Record<string, unknown> | null;
        if (!payload) continue;

        let shouldScrub = false;
        if (customerTgId && (payload.chatId === customerTgId || payload.customerTgId === customerTgId)) {
          shouldScrub = true;
        }
        if (phone && payload.phone === phone) {
          shouldScrub = true;
        }

        if (shouldScrub) {
          const scrubbedPayload: Prisma.InputJsonObject = {
            version: typeof payload.version === 'number' ? payload.version : 1,
            kind: ev.kind,
            providerRef: typeof payload.providerRef === 'string' ? payload.providerRef : null,
            orderId: typeof payload.orderId === 'string' ? payload.orderId : null,
            paidAmount: typeof payload.paidAmount === 'number' ? payload.paidAmount : null,
            quotedAmount: typeof payload.quotedAmount === 'number' ? payload.quotedAmount : null,
            currency: typeof payload.currency === 'string' ? payload.currency : null,
            text: '[USER_PII_PURGED]',
            phone: '[USER_PII_PURGED]',
            chatId: '[USER_PII_PURGED]',
          };

          await tx.inboxEvent.update({
            where: { id: ev.id },
            data: { payloadJson: scrubbedPayload },
          });
          scrubbedInboxCount++;
        }
      }

      return {
        ordersCount: scrubbedOrders.count,
        contactsCount: scrubbedContacts.count,
        inboxCount: scrubbedInboxCount,
      };
    });

    // 4. Enqueue high-priority GDPR Telegram message redaction for any Staff Bot cards
    let redactedStaffMessages = 0;
    for (const ord of matchingOrders) {
      if (ord.staffChatId && ord.staffMessageId) {
        await enqueueStaffMessageRedaction({
          orderId: ord.id,
          orderNumber: ord.orderNumber,
          staffChatId: ord.staffChatId,
          staffMessageId: ord.staffMessageId,
          finalStatusLabel: 'GDPR_PURGED',
        });
        redactedStaffMessages++;
      }
    }

    logger.adminAction('/api/admin/users/purge', 'POST', customerTgId || phone, 200);
    console.log(
      `[USER_PII_PURGE] target=${customerTgId || phone} orders=${result.ordersCount} contacts=${result.contactsCount} inboxEvents=${result.inboxCount} staffRedacted=${redactedStaffMessages}`
    );

    return NextResponse.json({ success: true, ...result, redactedStaffMessages }, { status: 200 });
  } catch (err: unknown) {
    logger.error('Failed to purge user PII', { error: String(err) });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
