import { prisma } from '@/lib/db/prisma';

jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    professionalProfile: {
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({ id: 'p-1', slug: 'new-slug' }),
    },
    slugRedirect: { upsert: jest.fn().mockResolvedValue({}), findUnique: jest.fn() },
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<void>) => fn(txMock)),
    auditEvent: { create: jest.fn() },
  },
}));

jest.mock('@/lib/security/staffAuth', () => ({
  emitAuditEvent: jest.fn().mockResolvedValue(undefined),
}));

const txMock = {
  professionalProfile: { update: jest.fn().mockResolvedValue({}) },
  slugRedirect: { upsert: jest.fn().mockResolvedValue({}) },
};

import { emitAuditEvent } from '@/lib/security/staffAuth';
import {
  SlugConflictError,
  renameProfileSlug,
  resolveStaleSlug,
} from '@/lib/kernel/slugRedirect';

const actor = { actorId: 'staff-1', actorRole: 'OWNER', resourceId: null } as never;

describe('SlugRedirect Service (T065, FR-437)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.$transaction as jest.Mock).mockImplementation(async (fn: (tx: unknown) => Promise<void>) => fn(txMock));
  });

  it('rename writes slug + redirect row atomically and audits the change', async () => {
    (prisma.professionalProfile.findUnique as jest.Mock)
      .mockResolvedValueOnce({ id: 'p-1', slug: 'old-slug' })
      .mockResolvedValueOnce(null);

    const result = await renameProfileSlug({ profileId: 'p-1', newSlug: 'New-Slug', actor });

    expect(result.oldSlug).toBe('old-slug');
    expect(txMock.professionalProfile.update).toHaveBeenCalledWith({
      where: { id: 'p-1' },
      data: { slug: 'new-slug' },
    });
    expect(txMock.slugRedirect.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { oldSlug: 'old-slug' } })
    );
    expect(emitAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'PROFILE_SLUG_RENAMED' })
    );
  });

  it('rename to the same slug is a no-op (no redirect row)', async () => {
    (prisma.professionalProfile.findUnique as jest.Mock).mockResolvedValue({
      id: 'p-1',
      slug: 'same-slug',
    });
    const result = await renameProfileSlug({ profileId: 'p-1', newSlug: 'same-slug', actor });
    expect(result.oldSlug).toBeNull();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects rename to a slug taken by another profile (409 SlugConflictError)', async () => {
    (prisma.professionalProfile.findUnique as jest.Mock)
      .mockResolvedValueOnce({ id: 'p-1', slug: 'old-slug' })
      .mockResolvedValueOnce({ id: 'p-2', slug: 'taken-slug' });

    await expect(
      renameProfileSlug({ profileId: 'p-1', newSlug: 'taken-slug', actor })
    ).rejects.toBeInstanceOf(SlugConflictError);
  });

  it('resolveStaleSlug maps old slug to the profile CURRENT slug (redirect-before-404)', async () => {
    (prisma.slugRedirect.findUnique as jest.Mock).mockResolvedValue({ oldSlug: 'old', profileId: 'p-1' });
    (prisma.professionalProfile.findUnique as jest.Mock).mockResolvedValue({ slug: 'current-slug' });

    expect(await resolveStaleSlug('old')).toBe('current-slug');
  });

  it('resolveStaleSlug returns null when there is no redirect (genuine 404)', async () => {
    (prisma.slugRedirect.findUnique as jest.Mock).mockResolvedValue(null);
    expect(await resolveStaleSlug('ghost')).toBeNull();
  });
});
