import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { getCurrencyMetadata } from '@/config/currency-registry';
import { listServices } from '@/lib/kernel/serviceService';
import { logger } from '@/lib/telemetry/logger';

export async function GET(): Promise<NextResponse> {
  try {
    const settings = await prisma.shopSettings.findUnique({
      where: { id: 1 },
    });

    const currency = settings?.currency || 'USD';
    const currencyConfirmed = settings?.currencyConfirmed ?? false;
    const currencyMeta = getCurrencyMetadata(currency);

    // Fetch active services
    const allServices = await listServices({ activeOnly: true });

    // Filter services: if currency not confirmed, hide pricing
    const services = allServices.map((svc) => ({
      id: svc.id,
      slug: svc.slug,
      title: svc.title,
      description: svc.description,
      durationMin: svc.durationMin,
      inCallEnabled: svc.inCallEnabled,
      outCallEnabled: svc.outCallEnabled,
      pricing: currencyConfirmed
        ? {
            currency,
            inCallTotal: svc.inCallPricing?.formattedTotal,
            outCallTotal: svc.outCallPricing?.formattedTotal,
            outCallTravelFee: svc.outCallPricing?.formattedTravelFee,
          }
        : null,
    }));

    // Fetch published active professionals
    const profiles = await prisma.professionalProfile.findMany({
      where: {
        isPublished: true,
        staffMember: { active: true },
      },
      include: {
        staffMember: { select: { displayName: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const professionals = profiles.map((p) => ({
      slug: p.slug,
      displayName: p.staffMember.displayName,
      headline: p.headline,
      photoUrl: p.photoUrl,
    }));

    // Respect privacy: address only returned if public display is enabled by OWNER (FR-335)
    const publicAddress = settings?.businessServiceAddressPublic
      ? settings?.businessServiceAddress
      : null;

    return NextResponse.json({
      business: {
        name: settings?.businessName || 'UnderUndre Sovereign Store',
        description: settings?.businessDescription || null,
        logoUrl: settings?.logoUrl || null,
        defaultLocale: settings?.defaultLocale || 'en',
        timeZone: settings?.timeZone || 'UTC',
        currency,
        currencyConfirmed,
        currencyMetadata: currencyMeta,
        contactLinks: settings?.publicContactLinksJson || [],
        serviceAddress: publicAddress,
        serviceAddressPublic: settings?.businessServiceAddressPublic ?? false,
        outCallCoverageDescription: settings?.outCallCoverageDescription || null,
        requireStaffApprovalForInCall: settings?.requireStaffApprovalForInCall ?? false,
      },
      services,
      professionals,
    });
  } catch (err: unknown) {
    logger.error('Failed to fetch public business page', { error: String(err) });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
