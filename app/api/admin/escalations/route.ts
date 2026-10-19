import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { authenticateAdmin } from '@/lib/security/adminAuth';
import { logger } from '@/lib/telemetry/logger';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = authenticateAdmin(req);
  if (!auth.authenticated) {
    return auth.errorResponse!;
  }

  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type') || 'all';

  try {
    let tickets: unknown[] = [];
    let orders: unknown[] = [];

    if (type === 'all' || type === 'ai_ticket') {
      tickets = await prisma.escalationTicket.findMany({
        where: { isResolved: false },
        orderBy: { createdAt: 'desc' },
      });
    }

    if (type === 'all' || type === 'slot_conflict') {
      const conflictOrders = await prisma.order.findMany({
        where: {
          requiresOperatorAction: true,
          operatorActionReason: 'OVERBOOKED_MANUAL_RESOLUTION',
        },
        include: {
          reservation: true,
          items: { include: { item: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
      orders = [...orders, ...conflictOrders];
    }

    if (type === 'all' || type === 'paid_out_of_stock') {
      const stockOrders = await prisma.order.findMany({
        where: {
          requiresOperatorAction: true,
          operatorActionReason: 'PAID_OUT_OF_STOCK',
        },
        include: {
          items: { include: { item: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
      orders = [...orders, ...stockOrders];
    }

    logger.adminAction('/api/admin/escalations', 'GET', `filter=${type}`, 200);
    return NextResponse.json(
      {
        filter: type,
        aiTickets: tickets,
        operatorOrders: orders,
        totalUnresolved: tickets.length + orders.length,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    logger.error('Failed to fetch admin escalations', { error: String(err) });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
