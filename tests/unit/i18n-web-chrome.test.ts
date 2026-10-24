/**
 * T040 (US3, FR-411/413/414): web chrome i18n coverage.
 *
 * Rendering React components is not part of the jest node env here (no
 * @testing-library), so this suite verifies the contract the task defines:
 *   1. The AST i18n coverage gate (T044) passes — 100% of t()/useTranslations/
 *      getTranslations keys used by app/components/lib resolve in ru AND en,
 *      with full key parity and ICU `other` forms.
 *   2. Content-stays-authored (FR-414): business-data render paths
 *      (item.title / item.description / svc.title etc.) come straight from DB
 *      props — they are NOT routed through t(), and the message catalog never
 *      ships a fixed business title/description value.
 *   3. The chrome namespaces exist for both locales with the LocaleSwitcher +
 *      storefront layout keys in place.
 */

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

const repoRoot = path.resolve(__dirname, '..', '..');

function loadMessages(locale: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, 'messages', `${locale}.json`), 'utf-8'));
}

function flatten(obj: Record<string, unknown>, prefix = ''): string[] {
  const keys: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object') keys.push(...flatten(v as Record<string, unknown>, p));
    else keys.push(p);
  }
  return keys;
}

function read(rel: string): string {
  return fs.readFileSync(path.join(repoRoot, rel), 'utf-8');
}

describe('T040 web chrome i18n', () => {
  it('i18n coverage gate passes (100% chrome keys resolve in ru + en, parity OK)', () => {
    const res = spawnSync('node', [path.join(repoRoot, 'scripts', 'i18n-coverage-gate.mjs')], {
      cwd: repoRoot,
      encoding: 'utf-8',
    });
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('PASS');
  });

  it('ru/en catalogs have identical flattened key sets', () => {
    const ru = flatten(loadMessages('ru'));
    const en = flatten(loadMessages('en'));
    expect(new Set(ru)).toEqual(new Set(en));
  });

  it('chrome namespaces cover the storefront layout + locale switcher', () => {
    for (const locale of ['ru', 'en']) {
      const msg = loadMessages(locale) as {
        web: Record<string, Record<string, unknown>>;
        admin: Record<string, Record<string, unknown>>;
      };
      // layout.tsx chrome
      expect(msg.web.nav).toHaveProperty('catalog');
      expect(msg.web.header).toHaveProperty('bookSlot');
      expect(msg.web.footer).toHaveProperty('poweredBy');
      // LocaleSwitcher (T043 POST /api/preferences/language consumer)
      expect(msg.web.localeSwitcher).toHaveProperty('ru');
      expect(msg.web.localeSwitcher).toHaveProperty('en');
      // admin chrome (AdminNav)
      expect(msg.admin.nav).toHaveProperty('catalog');
      expect(msg.admin.nav).toHaveProperty('settings');
      // error chrome (FR-413: error messages localized, never a locale error)
      expect(msg.web.errors).toHaveProperty('generic');
    }
  });

  it('FR-414: business data is rendered from DB props, not the message catalog', () => {
    // ItemCard renders authored content directly — no t() around title/description.
    const itemCard = read('components/catalog/ItemCard.tsx');
    expect(itemCard).toContain('{item.title}');
    expect(itemCard).toContain('{item.description}');
    expect(itemCard).toContain("useTranslations('web.item')");

    // The catalog detail page keeps authored title/description un-wrapped.
    const detail = read('app/catalog/[slug]/page.tsx');
    expect(detail).toContain('{item.title}');
    expect(detail).toContain('{item.description}');

    // SlotGrid keeps the authored service title un-wrapped.
    const slotGrid = read('components/booking/SlotGrid.tsx');
    expect(slotGrid).toContain('{service.title}');

    // The message catalog must never ship a fixed business title/description:
    // chrome values with an ICU tag/placeholder are fine; a verbatim
    // "title"-keyed string is not.
    for (const locale of ['ru', 'en']) {
      const flat = flatten(loadMessages(locale));
      for (const key of flat) {
        // web.* must stay free of fixed business titles/descriptions
        // (admin.fields.title etc. are page headings — legitimate chrome).
        if (key.startsWith('web.')) {
          expect(key.endsWith('.title') || key.endsWith('.description')).toBe(false);
          expect(key.includes('itemTitle')).toBe(false);
        }
      }
    }
  });
});
