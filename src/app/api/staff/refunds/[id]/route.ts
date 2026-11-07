import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'

import configPromise from '@payload-config'

import { hasMinimumRole } from '@/access/roles'
import { resolveRefundRequest } from '@/lib/booking/refundService'

/**
 * Staff refund resolution surface (spec 003 FR-304, review F12):
 * POST /api/staff/refunds/[id]  body { action: 'approve' | 'reject' }
 * OWNER/OPERATOR only (canon 001: staff surfaces are app-API, never /admin).
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({ headers: req.headers })
  if (!user || !hasMinimumRole(user?.roles, 'OPERATOR')) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })
  }

  const { id } = await context.params
  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'INVALID_JSON' }, { status: 400 })
  }
  const action = body.action === 'approve' || body.action === 'reject' ? body.action : null
  if (!action) {
    return NextResponse.json({ error: 'action must be approve|reject' }, { status: 400 })
  }

  try {
    const result = await resolveRefundRequest(payload, {
      orderId: id,
      action,
      actorId: String(user.id),
    })
    return NextResponse.json(result)
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'ORDER_NOT_FOUND') {
      return NextResponse.json({ error: 'ORDER_NOT_FOUND' }, { status: 404 })
    }
    return NextResponse.json({ error: 'INTERNAL' }, { status: 500 })
  }
}
