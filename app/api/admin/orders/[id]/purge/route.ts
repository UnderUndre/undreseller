import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { authenticateAdmin } from '@/lib/security/adminAuth';
import { enqueueStaffMessageRedaction } from '@/lib/bot/staffBot';
import { logger } from '@/lib/telemetry/logger';

export async function POST(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const auth = authenticateAdmin(req);
  if (!auth.authenticated) {
    return auth.errorResponse!;
  }

  const params = await props.params;
  const { id } = params;

  if (!id) {
    return NextResponse.json({ error: 'Missing order id' }, { status: 400 });
  }

  try {
    const updated = await prisma.order.update({
      where: { id },
      data: {
        customerName: null,
        customerPhone: null,
        customerEmail: null,
        customerTgId: null,
        customerNotes: null,
      },
    });

    if (updated.staffChatId && updated.staffMessageId) {
      await enqueueStaffMessageRedaction({
        orderId: updated.id,
        orderNumber: updated.orderNumber,
        staffChatId: updated.staffChatId,
        staffMessageId: updated.staffMessageId,
        finalStatusLabel: 'GDPR_PURGED',
      });
    }

    logger.adminAction(`/api/admin/orders/${id}/purge`, 'POST', id, 200);
    return NextResponse.json({ success: true, orderId: updated.id }, { status: 200 });
  } catch (err: unknown) {
    logger.error('Failed to purge order PII', { error: String(err), orderId: id });
    return NextResponse.json({ error: 'Internal server error or order not found' }, { status: 500 });
  }
}
