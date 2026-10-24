import { NextRequest, NextResponse } from 'next/server';
import { randomBytes, scryptSync } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { authenticateStaff, emitAuditEvent } from '@/lib/security/staffAuth';
import { logger } from '@/lib/telemetry/logger';

const provisionStaffSchema = z.object({
  email: z.string().trim().email(),
  displayName: z.string().trim().min(2).max(120),
  role: z.enum(['OWNER', 'OPERATOR', 'PERFORMER']),
  resourceId: z.string().trim().min(1).max(64).optional(),
  initialPassword: z.string().min(12).max(128).optional(),
});

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = scryptSync(password, salt, 64);
  return `${salt}:${derivedKey.toString('hex')}`;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = await authenticateStaff(req, 'OWNER');
  if (!auth.authenticated) return auth.errorResponse!;

  try {
    const staffList = await prisma.staffMember.findMany({
      include: {
        resource: true,
        professionalProfile: { select: { slug: true, isPublished: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json({ staff: staffList }, { status: 200 });
  } catch (err: unknown) {
    logger.error('Failed to list staff', { error: String(err) });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await authenticateStaff(req, 'OWNER');
  if (!auth.authenticated) return auth.errorResponse!;

  try {
    const body = await req.json();
    const parsed = provisionStaffSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
    }

    const { email, displayName, role, resourceId, initialPassword } = parsed.data;
    const plainPassword = initialPassword || randomBytes(12).toString('hex');

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return NextResponse.json({ error: 'A user with this email already exists' }, { status: 409 });
    }

    // Provision User and Account in Better Auth tables
    const user = await prisma.user.create({
      data: {
        email,
        name: displayName,
        emailVerified: true,
      },
    });

    const passwordHash = hashPassword(plainPassword);
    await prisma.account.create({
      data: {
        id: `account_${user.id}`,
        userId: user.id,
        accountId: user.id,
        providerId: 'credential',
        password: passwordHash,
      },
    });

    // If resourceId specified, ensure Resource row exists
    const boundResourceId = resourceId || null;
    if (boundResourceId) {
      await prisma.resource.upsert({
        where: { id: boundResourceId },
        update: { active: true },
        create: {
          id: boundResourceId,
          name: displayName,
          kind: 'STAFF',
          active: true,
        },
      });
    }

    // Create StaffMember
    const staff = await prisma.staffMember.create({
      data: {
        authUserId: user.id,
        displayName,
        role: role,
        resourceId: boundResourceId,
        invitedById: auth.actor!.actorId,
        active: true,
      },
    });

    await emitAuditEvent({
      action: 'STAFF_MEMBER_PROVISIONED',
      actorId: auth.actor!.actorId,
      actorRole: auth.actor!.actorRole,
      aggregateType: 'STAFF_MEMBER',
      aggregateId: staff.id,
      reason: `Owner provisioned new ${role} staff member`,
      metadataJson: { role, displayName },
    });

    return NextResponse.json(
      {
        staff,
        initialPassword: plainPassword, // Returned once for out-of-band handoff
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    logger.error('Failed to provision staff', { error: String(err) });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
