#!/usr/bin/env node
/**
 * guard-destructive.mjs — PreToolUse(Bash) hook (FR-005).
 *
 * Blocks destructive commands per Standing Order #6:
 *   - rm -rf, rd /s, del /s
 *   - git push --force | -f
 *   - git reset --hard
 *   - DROP TABLE | DATABASE
 *   - --force | --yes | -y | --no-verify bypass flags
 *
 * Action: "ask" (interactive → confirm; headless → deny).
 * Quoted strings are stripped before matching (contracts §"Matching rules").
 * Fail-open: hook crash → exit 0 (never block on availability error).
 *
 * Per hermes.md F4: active even under --dangerously-skip-permissions.
 */

import { readFileSync } from "node:fs";

// ── Destructive patterns ──────────────────────────────────────────────────

/** Bash command prefixes that are destructive. Case-insensitive. */
const DESTRUCTIVE_PREFIXES = [
  { re: /\brm\s+-[a-zA-Z]*r[a-zA-Z]*f?\b/i, so: "#6", reason: "rm -rf" },
  { re: /\brd\s+\/s\b/i, so: "#6", reason: "rd /s (recursive delete)" },
  { re: /\bdel\s+\/s\b/i, so: "#6", reason: "del /s (recursive delete)" },
  { re: /\bgit\s+push\s+.*--force\b/i, so: "#3", reason: "git push --force" },
  { re: /\bgit\s+push\s+.*-f\b/i, so: "#3", reason: "git push -f" },
  { re: /\bgit\s+reset\s+--hard\b/i, so: "#6", reason: "git reset --hard" },
  { re: /\bDROP\s+(TABLE|DATABASE)\b/i, so: "#6", reason: "DROP TABLE/DATABASE" },
];

/** Bypass flags from Standing Order #3. */
const BYPASS_FLAGS = [
  { re: /\s--force\b/i, so: "#3", reason: "--force bypass flag" },
  { re: /\s--yes\b/i, so: "#3", reason: "--yes bypass flag" },
  { re: /\s-y\b/i, so: "#3", reason: "-y bypass flag" },
  { re: /\s--no-verify\b/i, so: "#3", reason: "--no-verify bypass flag" },
];

// ── Main ───────────────────────────────────────────────────────────────────

try {
  const raw = readFileSync(0, "utf8");
  const event = JSON.parse(raw);

  // Only check Bash commands
  if (event.tool_name !== "Bash" || !event.tool_input?.command) {
    process.exit(0);
  }

  const cmd = event.tool_input.command.trim();

  // Skip echo/printf — these are print commands where quoted destructive
  // strings are safe (e.g., echo "rm -rf docs"). Per gemini-code-assist review.
  if (cmd.startsWith("echo ") || cmd.startsWith("printf ")) {
    process.exit(0);
  }

  // Remove quote CHARACTERS only (not quoted content) to prevent bypasses
  // like bash -c "rm -rf /" → bash -c rm -rf / (now matches destructive patterns).
  // The old implementation replaced quoted substrings with '' allowing bypasses.
  const stripped = stripQuotes(event.tool_input.command);

  for (const { re, so, reason } of DESTRUCTIVE_PREFIXES) {
    if (re.test(stripped)) {
      emitAsk(so, reason, event.tool_input.command);
      process.exit(0);
    }
  }

  for (const { re, so, reason } of BYPASS_FLAGS) {
    if (re.test(stripped)) {
      emitAsk(so, reason, event.tool_input.command);
      process.exit(0);
    }
  }

  // No match → allow
  process.exit(0);
} catch {
  // Fail-open: never block on parse/hook error.
  process.exit(0);
}

// ── Helpers ────────────────────────────────────────────────────────────────

function stripQuotes(cmd) {
  // Remove quote CHARACTERS only, preserving the content inside them.
  // Per gemini-code-assist review: the old implementation replaced quoted
  // substrings with '' which allowed bypasses like bash -c "rm -rf" → bash -c "".
  return cmd.replace(/['"]/g, "");
}

function emitAsk(standingOrder, reason, originalCommand) {
  const output = {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "ask",
      permissionDecisionReason: `Standing Order ${standingOrder}: destructive command (${reason}). Confirm THIS invocation to proceed; defaults stay unchanged.`,
    },
  };
  process.stdout.write(JSON.stringify(output) + "\n");
}
