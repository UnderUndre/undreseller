import { execFileSync, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const GATE = path.join(process.cwd(), 'scripts', 'i18n-coverage-gate.mjs');

function makeFixtureDir(ruKeys: Record<string, string>, enKeys: Record<string, string>, sampleTsx?: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-gate-'));
  fs.mkdirSync(path.join(dir, 'messages'));
  fs.mkdirSync(path.join(dir, 'components'));
  fs.mkdirSync(path.join(dir, 'app'));
  fs.writeFileSync(path.join(dir, 'messages', 'ru.json'), JSON.stringify(ruKeys));
  fs.writeFileSync(path.join(dir, 'messages', 'en.json'), JSON.stringify(enKeys));
  if (sampleTsx) fs.writeFileSync(path.join(dir, 'components', 'sample.tsx'), sampleTsx);
  return dir;
}

function runGate(cwd: string, locales = 'ru,en'): { status: number; output: string } {
  const res = spawnSync(process.execPath, [GATE, '--locales', locales], { cwd, encoding: 'utf-8' });
  return { status: res.status ?? 1, output: `${res.stdout}${res.stderr}` };
}

describe('i18n Key-Coverage Gate (T044, FR-411, NFR-406)', () => {
  const goodTsx = `import { useTranslations } from 'next-intl';
export default function Sample() {
  const t = useTranslations('web.nav');
  return <button>{t('catalog')}</button>;
}`;

  it('passes when every used key resolves in both locales', () => {
    const dir = makeFixtureDir(
      { 'web.nav.catalog': 'Каталог' },
      { 'web.nav.catalog': 'Catalog' },
      goodTsx
    );
    const { status, output } = runGate(dir);
    expect(status).toBe(0);
    expect(output).toContain('PASS');
  });

  it('fails with location when a key is missing in one locale', () => {
    const dir = makeFixtureDir({ 'web.nav.catalog': 'Каталог' }, {}, goodTsx);
    const { status, output } = runGate(dir);
    expect(status).toBe(1);
    expect(output).toContain('[en] web.nav.catalog');
    expect(output).toContain('sample.tsx');
  });

  it('reports parity violations independently of usage', () => {
    const dir = makeFixtureDir(
      { 'web.extra': 'Только тут' },
      { 'web.nav.catalog': 'Catalog' }
    );
    const { status, output } = runGate(dir);
    expect(status).toBe(1);
    expect(output).toContain('parity');
    expect(output).toContain('web.extra');
  });

  it('ignores non-translation callees (fetch, createHash) — spike S3 callee filter', () => {
    const trickyTsx = `import { createHash } from 'node:crypto';
export function x() {
  const h = createHash('sha256').update('data');
  fetch('/api/x');
  return h;
}`;
    const dir = makeFixtureDir({ a: 'b' }, { a: 'b' }, trickyTsx);
    const { status } = runGate(dir);
    expect(status).toBe(0);
  });

  it('adding a locale is data-only: uk runs with the same gate logic', () => {
    const dir = makeFixtureDir(
      { 'web.nav.catalog': 'Каталог' },
      { 'web.nav.catalog': 'Catalog' },
      goodTsx
    );
    fs.writeFileSync(
      path.join(dir, 'messages', 'uk.json'),
      JSON.stringify({ 'web.nav.catalog': 'Каталог (uk)' })
    );
    const { status } = runGate(dir, 'ru,en,uk');
    expect(status).toBe(0);
  });

  it('gate is wired to the real repo messages and passes on the current scaffold', () => {
    const res = execFileSync(process.execPath, [GATE], { encoding: 'utf-8' });
    expect(res).toContain('PASS');
  });
});
