/**
 * Design-token gate wiring test (T102, US8, FR-431):
 *  - current repo state passes the gate (after the T100/T101 token migration)
 *  - a violating fixture fails the gate with exit 1
 *  - a clean fixture passes
 * The gate script is exercised as a real CLI (child process), since it is a
 * CI entry point.
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SCRIPT = join(process.cwd(), 'scripts', 'design-token-gate.mjs');

function runGate(args: string[] = []): { status: number; stdout: string; stderr: string } {
  const res = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
  return { status: res.status ?? -1, stdout: res.stdout || '', stderr: res.stderr || '' };
}

describe('Design token gate (T102, FR-431)', () => {
  it('current repo state passes: no generic-palette/raw-hex in brand/semantic roles', () => {
    const res = runGate();
    expect(res.status).toBe(0);
    expect(res.stdout).toMatch(/OK/);
  });

  describe('against fixtures', () => {
    let fixtureRoot: string;

    beforeEach(() => {
      fixtureRoot = mkdtempSync(join(tmpdir(), 'token-gate-'));
      mkdirSync(join(fixtureRoot, 'surface'));
    });

    afterEach(() => {
      rmSync(fixtureRoot, { recursive: true, force: true });
    });

    it('fails with exit 1 on generic palette utilities', () => {
      writeFileSync(
        join(fixtureRoot, 'surface', 'bad.tsx'),
        'export default () => <div className="bg-gray-900 text-gray-400 border-gray-800">x</div>;\n'
      );
      const res = runGate([fixtureRoot]);
      expect(res.status).toBe(1);
      expect(res.stderr).toMatch(/bg-gray-900/);
      expect(res.stderr).toMatch(/text-gray-400/);
    });

    it('fails with exit 1 on raw hex colors', () => {
      writeFileSync(
        join(fixtureRoot, 'surface', 'hexy.tsx'),
        'export const style = { color: "#f9fafb", border: "#000" };\n'
      );
      const res = runGate([fixtureRoot]);
      expect(res.status).toBe(1);
      expect(res.stderr).toMatch(/raw-hex/);
      expect(res.stderr).toMatch(/#f9fafb/);
    });

    it('passes on token-based files (base-*/brand/semantic utilities and var() refs)', () => {
      writeFileSync(
        join(fixtureRoot, 'surface', 'good.tsx'),
        'export default () => (\n' +
          '  <div className="bg-base-100 text-base-content border-base-300 bg-purple-600 text-white">x</div>\n' +
          ');\n' +
          'export const css = ".card { background: var(--color-base-200); }";\n'
      );
      const res = runGate([fixtureRoot]);
      expect(res.status).toBe(0);
    });
  });
});
