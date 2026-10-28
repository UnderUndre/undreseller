#!/usr/bin/env node
/**
 * i18n Key-Coverage Gate (T044, FR-411, NFR-406) — production version of spike S3.
 * Verifies 100% of chrome translation keys resolve in EVERY gated locale.
 * Adding a locale is data-only: pass `--locales ru,en,uk` or I18N_LOCALES env.
 *
 * Exit 0 = gate passed. Exit 1 = missing keys / parity violations / ICU issues.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import ts from 'typescript';

const repoRoot = process.cwd();
const SCAN_DIRS = ['app', 'components', 'lib'];
const SCAN_EXTS = new Set(['.ts', '.tsx']);

function parseArgs() {
  const argIdx = process.argv.indexOf('--locales');
  const envLocales = process.env.I18N_LOCALES;
  const raw = argIdx !== -1 && process.argv[argIdx + 1] ? process.argv[argIdx + 1] : envLocales;
  const locales = (raw || 'ru,en').split(',').map((l) => l.trim()).filter(Boolean);
  if (locales.length < 2) {
    console.error('Gate requires at least 2 locales for parity checking.');
    process.exit(1);
  }
  return locales;
}

function loadMessages(locale) {
  const file = path.join(repoRoot, 'messages', `${locale}.json`);
  if (!fs.existsSync(file)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}

function flatten(obj, prefix = '') {
  const keys = new Set();
  for (const [k, v] of Object.entries(obj)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object') {
      for (const sub of flatten(v, p)) keys.add(sub);
    } else {
      keys.add(p);
    }
  }
  return keys;
}

/** Only these callee names are treated as translation calls (spike S3 finding). */
const TRANSLATION_CALLEES = new Set(['t', 'getTranslations', 'useTranslations']);

function extractUsedKeys(sourceText) {
  const keys = new Set();
  const dynamic = [];
  const sf = ts.createSourceFile('x.tsx', sourceText, ts.ScriptTarget.ES2022, true);

  // Namespace bindings: `const t = useTranslations('ns')` / `getTranslations('ns')`
  const bindings = new Map(); // variable name -> namespace prefix

  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && ts.isCallExpression(node.initializer)) {
      const callee = node.initializer.expression;
      const calleeName = ts.isIdentifier(callee) ? callee.text : null;
      if (calleeName && TRANSLATION_CALLEES.has(calleeName) && node.initializer.arguments[0] && ts.isStringLiteral(node.initializer.arguments[0])) {
        bindings.set(node.name.text, node.initializer.arguments[0].text);
      }
    }
    if (ts.isCallExpression(node)) {
      const arg = node.arguments[0];
      if (ts.isIdentifier(node.expression) && TRANSLATION_CALLEES.has(node.expression.text)) {
        if (node.expression.text === 't' && bindings.has('t')) {
          // namespaced bound call: t('key') -> ns.key
          if (arg && ts.isStringLiteral(arg)) {
            keys.add(`${bindings.get('t')}.${arg.text}`);
          } else if (arg && (ts.isTemplateExpression(arg) || ts.isIdentifier(arg))) {
            dynamic.push(arg.getText());
          }
        } else if (node.expression.text !== 'useTranslations' && node.expression.text !== 'getTranslations') {
          // bare t() not bound to a namespace: treated as absolute key
          if (arg && ts.isStringLiteral(arg)) keys.add(arg.text);
        }
        // first-arg string of useTranslations/getTranslations itself = namespace, not a key
      } else if (
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'rich' &&
        ts.isIdentifier(node.expression.expression) &&
        bindings.has(node.expression.expression.text) &&
        arg && ts.isStringLiteral(arg)
      ) {
        keys.add(`${bindings.get(node.expression.expression.text)}.${arg.text}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return { keys, dynamic };
}

/** Resolve a possibly-namespaced usage key against the flattened message keys. */
function resolves(usageKey, flattened) {
  if (flattened.has(usageKey)) return true;
  // `t('key')` under a namespace-bound hook resolves to ns.key — try suffix match
  for (const k of flattened) {
    if (k.endsWith(`.${usageKey}`)) return true;
  }
  return false;
}

function hasIcuOther(message) {
  if (typeof message !== 'string') return true;
  if (!message.includes('plural,') && !message.includes('select,')) return true;
  return /\bother\s*\{/.test(message);
}

const locales = parseArgs();
const messages = new Map();
for (const locale of locales) {
  const m = loadMessages(locale);
  if (!m) {
    console.error(`FAIL: missing messages/${locale}.json`);
    process.exit(1);
  }
  messages.set(locale, { raw: m, flat: flatten(m) });
}

// Collect usage keys
const usedKeys = new Map(); // key -> [location]
const dynamicKeys = [];
function* walkFiles(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walkFiles(full);
    else if (SCAN_EXTS.has(path.extname(entry.name))) yield full;
  }
}
for (const dir of SCAN_DIRS) {
  const abs = path.join(repoRoot, dir);
  if (!fs.existsSync(abs)) continue;
  for (const file of walkFiles(abs)) {
    const rel = path.relative(repoRoot, file);
    if (rel.includes('spike') || rel.includes('generated')) continue;
    const text = fs.readFileSync(file, 'utf-8');
    if (!/useTranslations|getTranslations|\bt\(/.test(text)) continue;
    const { keys, dynamic } = extractUsedKeys(text);
    for (const k of keys) {
      if (!usedKeys.has(k)) usedKeys.set(k, []);
      usedKeys.get(k).push(rel);
    }
    dynamicKeys.push(...dynamic.map((d) => `${d} (${rel})`));
  }
}

// Check resolution + parity
const errors = [];
const parityByLocale = new Map(locales.map((l) => [l, messages.get(l).flat]));

for (const [key, locations] of usedKeys) {
  for (const locale of locales) {
    if (!resolves(key, parityByLocale.get(locale))) {
      errors.push(`  [${locale}] ${key}  — used at ${locations.join(', ')}`);
    }
  }
}

// Parity: identical flattened key sets across gated locales
const base = parityByLocale.get(locales[0]);
for (const locale of locales.slice(1)) {
  const other = parityByLocale.get(locale);
  for (const k of base) if (!other.has(k)) errors.push(`  parity: key "${k}" in ${locales[0]} but missing in ${locale}`);
  for (const k of other) if (!base.has(k)) errors.push(`  parity: key "${k}" in ${locale} but missing in ${locales[0]}`);
}

// ICU sanity: plural/select messages must have an `other` form
for (const locale of locales) {
  for (const [k, v] of flattenToPairs(messages.get(locale).raw)) {
    if (!hasIcuOther(v)) errors.push(`  ICU: ${locale}.${k} has plural/select without "other" form`);
  }
}

function flattenToPairs(obj, prefix = '') {
  const pairs = [];
  for (const [k, v] of Object.entries(obj)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object') pairs.push(...flattenToPairs(v, p));
    else pairs.push([p, v]);
  }
  return pairs;
}

console.log(`i18n coverage gate: locales=${locales.join(',')} usedKeys=${usedKeys.size} dynamicSkipped=${dynamicKeys.length}`);
if (dynamicKeys.length > 0) {
  console.log('  dynamic keys (skipped, allowlist via explicit key extraction):');
  for (const d of dynamicKeys.slice(0, 10)) console.log(`   - ${d}`);
}

if (errors.length > 0) {
  console.error(`FAIL: ${errors.length} i18n coverage violation(s):`);
  for (const e of errors) console.error(e);
  process.exit(1);
}
console.log('PASS: 100% of chrome keys resolve in all gated locales; parity OK; ICU OK.');
