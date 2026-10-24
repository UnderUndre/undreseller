#!/usr/bin/env node
/**
 * Design-token gate (T102, US8, FR-431): zero generic-palette utilities and
 * raw hex colors in brand/semantic roles.
 *
 * Scans .tsx/.css under the target dirs (default: app/, components/) for:
 *  - Tailwind generic gray-family palette utilities (bg-gray-*, text-slate-*, etc.)
 *  - raw hex literals (#fff, #1f2937, ...)
 * Whitelisted: token definition files (app/globals.css) and an explicit
 * per-file allowlist with inline justification below. node_modules is not
 * scanned (only app/ + components/ are walked).
 *
 * Exit codes: 0 = clean, 1 = violations found (CI-able).
 *
 * Usage: node scripts/design-token-gate.mjs [targetDir...]
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const DEFAULT_TARGETS = ['app', 'components'];

/**
 * Explicit, per-file allowlist. Every entry must carry a justification —
 * blanket skips are forbidden (T102 rule).
 */
const ALLOWLIST = new Map([
  [
    'app/globals.css',
    'Token definition/wiring file: maps @underundre/undesign CSS variables into the Tailwind theme and composes semantic surfaces — raw values here ARE the single source of truth (FR-431).',
  ],
]);

const GENERIC_PALETTE = /\b(?:bg|text|border|ring|divide|placeholder|from|to|via|fill|stroke|outline|accent|caret|decoration)-(?:gray|slate|zinc|neutral|stone)-\d+/;
const RAW_HEX = /#[0-9a-fA-F]{3,8}\b/;

export function scanFile(content) {
  const violations = [];
  const lines = content.split('\n');
  lines.forEach((line, i) => {
    const palette = line.match(GENERIC_PALETTE);
    if (palette) {
      violations.push({ line: i + 1, kind: 'generic-palette', match: palette[0], snippet: line.trim() });
    }
    const hex = line.match(RAW_HEX);
    if (hex) {
      violations.push({ line: i + 1, kind: 'raw-hex', match: hex[0], snippet: line.trim() });
    }
  });
  return violations;
}

function walkTsxCss(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out; // target dir missing — nothing to scan
  }
  for (const name of entries) {
    if (name === 'node_modules' || name === 'dist') continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walkTsxCss(full));
    else if (/\.(tsx|css)$/.test(name)) out.push(full);
  }
  return out;
}

export function runGate(targets = DEFAULT_TARGETS, cwd = process.cwd()) {
  const violations = [];
  for (const target of targets) {
    for (const file of walkTsxCss(target)) {
      const rel = relative(cwd, file).split(sep).join('/');
      if (ALLOWLIST.has(rel)) continue;
      for (const v of scanFile(readFileSync(file, 'utf8'))) {
        violations.push({ file: rel, ...v });
      }
    }
  }
  return violations;
}

export function isMainModule(importMeta) {
  const entry = process.argv[1];
  if (!entry || !importMeta?.filename) return false;
  return importMeta.filename === entry;
}

if (isMainModule(import.meta)) {
  const targets = process.argv.slice(2);
  const found = runGate(targets.length ? targets : DEFAULT_TARGETS);

  if (found.length === 0) {
    console.log('design-token-gate: OK — no generic-palette/raw-hex usage in brand/semantic roles (FR-431).');
    process.exit(0);
  }

  console.error(`design-token-gate: ${found.length} violation(s) — generic palette / raw hex are prohibited in brand/semantic roles (FR-431).`);
  for (const v of found) {
    console.error(`  ${v.file}:${v.line} [${v.kind}] ${v.match} — ${v.snippet}`);
  }
  console.error('\nUse @underundre/undesign tokens (base-*/brand scales/semantic colors).');
  console.error('If a file legitimately needs raw values, add it to ALLOWLIST with a justification.');
  process.exit(1);
}
