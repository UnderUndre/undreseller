#!/usr/bin/env ts-node

/**
 * 004 Language Defaults Backfill (T011, Phase 2 Dual-Write & Backfill)
 * Idempotent: sets ShopSettings.defaultLocale from existing config heuristics.
 * Rate-limited batches; safe to re-run (defaultLocale is only set when NULL/empty).
 * Compliance: NIST SP 800-218 SSDF & ISO/IEC/IEEE 12207:2017 (Constitution X Phase 2)
 */

import { prisma } from '../lib/db/prisma';

const SUPPORTED_LOCALES = new Set(['ru', 'en']);
const BATCH_SIZE = 100;

export interface BackfillSummary {
  settingsScanned: number;
  defaultLocaleSet: number;
  skippedAlreadySet: number;
  quantizedItemsLeftLegacy: number;
}

/**
 * Heuristic: derive instance default locale from existing greeting/config content.
 * Cyrillic-heavy greeting -> 'ru', otherwise 'en'. Deterministic and idempotent.
 */
export function inferDefaultLocale(greeting: string | null | undefined): 'ru' | 'en' {
  if (!greeting) return 'en';
  const cyrillic = (greeting.match(/[\u0400-\u04FF]/g) || []).length;
  const latin = (greeting.match(/[A-Za-z]/g) || []).length;
  return cyrillic > latin ? 'ru' : 'en';
}

export async function runBackfill004LanguageDefaults(): Promise<BackfillSummary> {
  const summary: BackfillSummary = {
    settingsScanned: 0,
    defaultLocaleSet: 0,
    skippedAlreadySet: 0,
    quantizedItemsLeftLegacy: 0,
  };

  let cursor: number | undefined = undefined;
  for (;;) {
    const batch = await prisma.shopSettings.findMany({
      where: cursor ? { id: { gt: cursor } } : undefined,
      orderBy: { id: 'asc' },
      take: BATCH_SIZE,
    });
    if (batch.length === 0) break;

    for (const settings of batch) {
      summary.settingsScanned++;
      cursor = settings.id;

      const current = settings.defaultLocale as string | null;
      if (current && SUPPORTED_LOCALES.has(current)) {
        summary.skippedAlreadySet++;
        continue;
      }

      const inferred = inferDefaultLocale(settings.greeting);
      await prisma.shopSettings.update({
        where: { id: settings.id },
        data: { defaultLocale: inferred },
      });
      summary.defaultLocaleSet++;
    }
  }

  // Item duration 15-min quantum (data-model 1.8): legacy rows are LEFT as-is
  // (plan decision) — count them for the ops report only.
  summary.quantizedItemsLeftLegacy = await prisma.item.count({
    where: { durationMin: { not: null } },
  });

  return summary;
}

const isMainModule = process.argv[1]?.includes('backfill-004-language-defaults');
if (isMainModule) {
  runBackfill004LanguageDefaults()
    .then((summary) => {
      console.log('[BACKFILL-004]', JSON.stringify(summary));
      process.exit(0);
    })
    .catch((err) => {
      console.error('[BACKFILL-004-FAILED]', err);
      process.exit(1);
    });
}
