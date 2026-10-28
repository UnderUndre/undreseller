/**
 * SlugRedirect Service (T065, US9, FR-437)
 * Slugs are immutable: renaming a professional profile writes a SlugRedirect row
 * (oldSlug → profileId). Lookup on the `/professionals/[slug]` 404-path returns a
 * 301 before falling through to a real 404.
 */

import { prisma } from '@/lib/db/prisma';
import { emitAuditEvent } from '@/lib/security/staffAuth';
import { StaffActorContext } from '@/lib/security/staffRbac';

export class SlugConflictError extends Error {
  readonly statusCode = 409;
  constructor(slug: string) {
    super(`Slug already taken: ${slug}`);
    this.name = 'SlugConflictError';
  }
}

/**
 * Renames a profile slug. If the old slug existed on a different profile, a
 * redirect row is written so old links keep working (301). Returns the redirect
 * row or null when no redirect was needed.
 */
export async function renameProfileSlug(params: {
  profileId: string;
  newSlug: string;
  actor: StaffActorContext;
}): Promise<{ oldSlug: string | null }> {
  const { profileId, newSlug, actor } = params;
  const slug = newSlug.toLowerCase().trim();

  const profile = await prisma.professionalProfile.findUnique({ where: { id: profileId } });
  if (!profile) {
    const error: Error & { statusCode?: number } = Object.assign(new Error(`Profile not found: ${profileId}`), { statusCode: 404 });
    throw error;
  }

  const oldSlug = profile.slug;
  if (oldSlug === slug) {
    return { oldSlug: null };
  }

  const slugTaken = await prisma.professionalProfile.findUnique({ where: { slug } });
  if (slugTaken) {
    throw new SlugConflictError(slug);
  }

  await prisma.$transaction(async (tx) => {
    await tx.professionalProfile.update({ where: { id: profileId }, data: { slug } });
    // Redirect: old slug → profile (FR-437). Upsert keeps re-renders idempotent.
    await tx.slugRedirect.upsert({
      where: { oldSlug },
      update: { profileId },
      create: { oldSlug, profileId },
    });
  });

  await emitAuditEvent({
    action: 'PROFILE_SLUG_RENAMED',
    actorId: actor.actorId,
    actorRole: actor.actorRole,
    aggregateType: 'PROFESSIONAL_PROFILE',
    aggregateId: profileId,
    reason: 'Slug renamed; 301 redirect created',
    metadataJson: { oldSlug, newSlug: slug },
  });

  return { oldSlug };
}

/**
 * 301 resolution for a stale slug: returns the profile's CURRENT slug, or null
 * when the stale slug has no redirect (a genuine 404).
 */
export async function resolveStaleSlug(oldSlug: string): Promise<string | null> {
  const redirect = await prisma.slugRedirect.findUnique({
    where: { oldSlug: oldSlug.toLowerCase().trim() },
  });
  if (!redirect) return null;
  const profile = await prisma.professionalProfile.findUnique({
    where: { id: redirect.profileId },
    select: { slug: true },
  });
  return profile?.slug ?? null;
}
