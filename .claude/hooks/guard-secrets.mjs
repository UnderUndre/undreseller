#!/usr/bin/env node
/**
 * guard-secrets.mjs — PreToolUse(Read|Grep|Glob|Bash) hook (FR-006).
 *
 * Denies secret-file reads per Standing Order #7:
 *   .env, .env.* (except .example/.sample/.template suffixes)
 *   SSH keys, PEM keys, id_rsa*, *.key
 *
 * Action: "deny" (hard block — secrets > convenience).
 * Fail-CLOSED: hook crash → deny (leak prevention > availability).
 *
 * Per hermes.md F4: active even under --dangerously-skip-permissions.
 * Per hermes.md F11: consumer-extensible allowlist via .claude/settings.json
 *   "secretAllowlist" array (glob patterns, additive only).
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, basename, sep } from "node:path";

// ── Secret globs ──────────────────────────────────────────────────────────

/** Files that are secrets. Matched against the normalized file path. */
const SECRET_PATTERNS = [
  /\.env$/i,
  /\.env\./i,                          // .env.* — any subextension
  /\.ssh[\\/]/i,                       // ~/.ssh/ or **/.ssh/
  /id_rsa/i,
  /\.pem$/i,
  /\.key$/i,
];

/** Suffixes that are NOT secrets (legitimate example/sample/template files). */
const ALLOWLIST_SUFFIXES = [
  /\.example$/i,
  /\.sample$/i,
  /\.template$/i,
];

/** Consumer-extensible allowlist (loaded from .claude/settings.json per F11). */
let consumerAllowlist = [];
try {
  const settingsPath = resolve(process.cwd(), ".claude", "settings.json");
  if (existsSync(settingsPath)) {
    const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
    if (Array.isArray(settings.secretAllowlist)) {
      consumerAllowlist = settings.secretAllowlist.map(
        (p) => new RegExp(globToRegex(p), "i"),
      );
    }
  }
} catch {
  // Settings not loadable → consumer allowlist empty (hardcoded defaults still work).
}

// ── Main ───────────────────────────────────────────────────────────────────

try {
  const raw = readFileSync(0, "utf8");
  const event = JSON.parse(raw);

  // Extract file path(s) from the tool call
  const paths = extractPaths(event);
  if (paths.length === 0) {
    process.exit(0); // No file path to check → allow
  }

  for (const p of paths) {
    const normalized = normalizePath(p);
    if (isSecret(normalized)) {
      emitDeny(normalized);
      process.exit(0);
    }
  }

  // No secrets → allow
  process.exit(0);
} catch {
  // Fail-CLOSED: if the hook cannot determine safety, deny.
  emitDeny("(unparseable input — guard-secrets fail-closed)");
  process.exit(0);
}

// ── Helpers ────────────────────────────────────────────────────────────────

function extractPaths(event) {
  const input = event.tool_input || {};
  const out = [];
  // Read: file_path
  if (input.file_path) out.push(input.file_path);
  // Grep/Glob: path
  if (input.path) out.push(input.path);
  // Grep: pattern (may contain glob, not a path — skip)
  // Bash: command (check for secret-file references)
  if (event.tool_name === "Bash" && input.command) {
    // Check for cat/less/head/tail of secret files
    // Per gemini-code-assist review: stripQuotes removes quote CHARS only,
    // preserving content for secret-path matching. The old implementation
    // replaced quoted substrings with '' which allowed bypasses like
    // cat ".env" → cat "" (content gone, no secret match).
    const stripped = stripQuotes(input.command);
    const secretReaders = stripped.match(/\b(?:cat|less|more|head|tail|cp|mv)\s+(\S+)/gi) || [];
    for (const m of secretReaders) {
      out.push(m.split(/\s+/)[1] || "");
    }
  }
  return out.filter(Boolean);
}

function normalizePath(p) {
  return p.split("\\").join("/").toLowerCase();
}

function isSecret(normalizedPath) {
  // Check hardcoded suffix allowlist first
  for (const suffix of ALLOWLIST_SUFFIXES) {
    if (suffix.test(normalizedPath)) return false;
  }
  // Check consumer allowlist
  for (const allow of consumerAllowlist) {
    if (allow.test(normalizedPath)) return false;
  }
  // Check secret patterns
  for (const secret of SECRET_PATTERNS) {
    if (secret.test(normalizedPath)) return true;
  }
  return false;
}

function stripQuotes(cmd) {
  // Remove quote CHARACTERS only, preserving the content inside them.
  // The old implementation replaced '...' and "..." with '' and "" respectively,
  // which allowed bypasses like cat ".env" → cat "" (secret path gone, no match).
  // Per gemini-code-assist review: removing quote chars keeps the path visible.
  return cmd.replace(/['"]/g, "");
}

function globToRegex(glob) {
  return glob
    .replace(/\*\*/g, ".*")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, "[^/]");
}

function emitDeny(pathOrReason) {
  const output = {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: `Standing Order #7: secret file read (${pathOrReason}). Whitelist explicitly in .claude/settings.json#secretAllowlist if truly intended.`,
    },
  };
  process.stdout.write(JSON.stringify(output) + "\n");
}
