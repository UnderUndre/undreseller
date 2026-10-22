/**
 * Professional Profile and Portfolio Application Service (T010, US12)
 * Requirements: FR-335, FR-336, FR-338, FR-339, INV-010
 * Standards: NIST SP 800-218 SSDF & ISO/IEC/IEEE 12207:2017
 */

import { prisma } from '../db/prisma';
import { StaffActorContext } from '../security/staffRbac';
import { emitAuditEvent } from '../security/staffAuth';
import { resolveServicePrice } from '../../config/currency-registry';
import { HTML_TAG_REGEX, SAFE_URL_REGEX } from '../../config/shop.config';

export interface PublicPortfolioItemView {
  id: string;
  title: string;
  description: string | null;
  mediaUrl: string;
  sortOrder: number;
}

export interface PublicProfileServiceView {
  id: string;
  slug: string;
  title: string;
  description: string;
  durationMin: number;
  inCallEnabled: boolean;
  outCallEnabled: boolean;
  pricing?: {
    currency: string;
    inCallTotal?: string;
    outCallTotal?: string;
    outCallTravelFee?: string;
  };
}

export interface PublicProfessionalProfileView {
  slug: string;
  displayName: string;
  headline: string | null;
  biography: string | null;
  photoUrl: string | null;
  portfolio: PublicPortfolioItemView[];
  services: PublicProfileServiceView[];
}

export async function getPublicProfileBySlug(
  slug: string
): Promise<PublicProfessionalProfileView | null> {
  const profile = await prisma.professionalProfile.findUnique({
    where: { slug },
    include: {
      staffMember: true,
      portfolioItems: {
        where: { isPublished: true },
        orderBy: { sortOrder: 'asc' },
      },
      services: {
        include: {
          item: true,
        },
      },
    },
  });

  if (!profile || !profile.isPublished || !profile.staffMember.active) {
    return null;
  }

  const settings = await prisma.shopSettings.findUnique({ where: { id: 1 } });
  const currencyConfirmed = settings?.currencyConfirmed ?? false;
  const currency = settings?.currency || 'USD';

  const services: PublicProfileServiceView[] = profile.services
    .filter((ps) => ps.item.isActive && ps.item.itemType === 'SERVICE')
    .map((ps) => {
      const item = ps.item;
      let pricing;

      if (currencyConfirmed) {
        const inCall = item.inCallEnabled ? resolveServicePrice(item, 'IN_CALL', currency) : undefined;
        const outCall = item.outCallEnabled ? resolveServicePrice(item, 'OUT_CALL', currency) : undefined;
        pricing = {
          currency,
          inCallTotal: inCall?.formattedTotal,
          outCallTotal: outCall?.formattedTotal,
          outCallTravelFee: outCall ? outCall.formattedTravelFee : undefined,
        };
      }

      return {
        id: item.id,
        slug: item.slug,
        title: item.title,
        description: item.description,
        durationMin: item.durationMin || 60,
        inCallEnabled: item.inCallEnabled,
        outCallEnabled: item.outCallEnabled,
        pricing,
      };
    });

  return {
    slug: profile.slug,
    displayName: profile.staffMember.displayName,
    headline: profile.headline,
    biography: profile.biography,
    photoUrl: profile.photoUrl,
    portfolio: profile.portfolioItems.map((pi) => ({
      id: pi.id,
      title: pi.title,
      description: pi.description,
      mediaUrl: pi.mediaUrl,
      sortOrder: pi.sortOrder,
    })),
    services,
  };
}

export async function assertProfileOwnership(
  profileId: string,
  actor: StaffActorContext
): Promise<any> {
  const profile = await prisma.professionalProfile.findUnique({
    where: { id: profileId },
    include: { staffMember: true },
  });

  if (!profile) {
    const error = new Error(`Profile not found: ${profileId}`);
    (error as any).statusCode = 404;
    throw error;
  }

  // PERFORMER can only access and edit their own profile
  if (actor.actorRole === 'PERFORMER' && profile.staffMemberId !== actor.actorId) {
    const error = new Error('Forbidden: Performer cannot manage another staff member profile');
    (error as any).statusCode = 403;
    throw error;
  }

  return profile;
}

export interface UpdateProfileInput {
  slug?: string;
  headline?: string | null;
  biography?: string | null;
  photoUrl?: string | null;
  isPublished?: boolean;
}

export async function updateProfile(
  id: string,
  input: UpdateProfileInput,
  actor: StaffActorContext
): Promise<any> {
  const profile = await assertProfileOwnership(id, actor);

  if (input.headline && HTML_TAG_REGEX.test(input.headline)) {
    throw new Error('HTML tags are strictly prohibited in profile headline');
  }
  if (input.biography && HTML_TAG_REGEX.test(input.biography)) {
    throw new Error('HTML tags are strictly prohibited in profile biography');
  }
  if (input.photoUrl && !SAFE_URL_REGEX.test(input.photoUrl)) {
    throw new Error('Photo URL must use http:// or https:// scheme');
  }

  const updated = await prisma.professionalProfile.update({
    where: { id },
    data: {
      ...(input.slug ? { slug: input.slug.toLowerCase().trim() } : {}),
      ...(input.headline !== undefined ? { headline: input.headline ? input.headline.trim() : null } : {}),
      ...(input.biography !== undefined ? { biography: input.biography ? input.biography.trim() : null } : {}),
      ...(input.photoUrl !== undefined ? { photoUrl: input.photoUrl ? input.photoUrl.trim() : null } : {}),
      ...(input.isPublished !== undefined ? { isPublished: input.isPublished } : {}),
    },
    include: {
      staffMember: true,
      portfolioItems: true,
      services: { include: { item: true } },
    },
  });

  await emitAuditEvent({
    action: 'PROFESSIONAL_PROFILE_UPDATED',
    actorId: actor.actorId,
    actorRole: actor.actorRole,
    aggregateType: 'PROFESSIONAL_PROFILE',
    aggregateId: updated.id,
    reason: `Staff updated professional profile for ${profile.staffMember.displayName}`,
    metadataJson: { isPublished: updated.isPublished, slug: updated.slug },
  });

  return updated;
}

export async function addPortfolioItem(
  profileId: string,
  item: { title: string; description?: string | null; mediaUrl: string; sortOrder?: number; isPublished?: boolean },
  actor: StaffActorContext
): Promise<any> {
  await assertProfileOwnership(profileId, actor);

  if (HTML_TAG_REGEX.test(item.title) || (item.description && HTML_TAG_REGEX.test(item.description))) {
    throw new Error('HTML tags are prohibited in portfolio item text');
  }
  if (!SAFE_URL_REGEX.test(item.mediaUrl)) {
    throw new Error('Media URL must use http:// or https:// scheme');
  }

  return prisma.portfolioItem.create({
    data: {
      professionalProfileId: profileId,
      title: item.title.trim(),
      description: item.description ? item.description.trim() : null,
      mediaUrl: item.mediaUrl.trim(),
      sortOrder: item.sortOrder ?? 0,
      isPublished: item.isPublished ?? true,
    },
  });
}

export async function linkServicesToProfile(
  profileId: string,
  itemIds: string[],
  actor: StaffActorContext
): Promise<void> {
  await assertProfileOwnership(profileId, actor);

  // Re-link services atomically
  await prisma.$transaction(async (tx) => {
    await tx.professionalService.deleteMany({
      where: { professionalProfileId: profileId },
    });

    if (itemIds.length > 0) {
      await tx.professionalService.createMany({
        data: itemIds.map((itemId) => ({
          professionalProfileId: profileId,
          itemId,
        })),
        skipDuplicates: true,
      });
    }
  });

  await emitAuditEvent({
    action: 'PROFESSIONAL_SERVICES_LINKED',
    actorId: actor.actorId,
    actorRole: actor.actorRole,
    aggregateType: 'PROFESSIONAL_PROFILE',
    aggregateId: profileId,
    reason: `Linked ${itemIds.length} services to professional profile`,
    metadataJson: { serviceCount: itemIds.length },
  });
}
