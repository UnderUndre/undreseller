#!/usr/bin/env node
/**
 * post-edit-feedback.mjs — PostToolUse(Edit|Write) hook (FR-007).
 *
 * Runs detected formatter/linter on the edited file and emits output as
 * `additionalContext` (≤2000 chars). Silent no-op when no tooling is detected.
 *
 * Per hermes.md F10 perf safeguards:
 *   (a) Only run on whitelisted extensions
 *   (b) Debounce: skip if same file was linted within last 10 seconds
 *   (c) Stream stdout; kill on timeout; never block PostToolUse return
 *   (d) Configurable timeout (default 30s)
 *
 * Per hermes.md F5: idempotent to double-firing; prefixes output with
 * [helpers/guard-feedback] marker for consumer hook coexistence.
 */

import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { extname, basename } from "node:path";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ── Config ─────────────────────────────────────────────────────────────────

const WHITELISTED_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".json", ".yml", ".yaml", ".md",
  ".rs", ".go", ".py", ".css", ".scss", ".html", ".vue", ".svelte",
]);

const DEBOUNCE_MS = 10_000;
const TIMEOUT_SECONDS = 30;
const MAX_OUTPUT_CHARS = 2000;

// Cross-process debounce: persist timestamps to a temp file
// (in-process Map is ineffective since each hook invocation is a new process.
// Per gemini-code-assist review: the old in-process Map was always empty.)
const DEBOUNCE_FILE = join(tmpdir(), "helpers-post-edit-debounce.json");

function loadDebounce(): Record<string, number> {
  try {
    if (existsSync(DEBOUNCE_FILE)) {
      return JSON.parse(readFileSync(DEBOUNCE_FILE, "utf8"));
    }
  } catch {}
  return {};
}

function saveDebounce(map: Record<string, number>): void {
  try {
    writeFileSync(DEBOUNCE_FILE, JSON.stringify(map));
  } catch {}
}

// ── Main ───────────────────────────────────────────────────────────────────

try {
  const raw = readFileSync(0, "utf8");
  const event = JSON.parse(raw);

  if (event.tool_name !== "Edit" && event.tool_name !== "Write") {
    process.exit(0);
  }

  const filePath = event.tool_input?.file_path;
  if (!filePath) process.exit(0);

  // (a) Skip non-whitelisted extensions
  const ext = extname(filePath).toLowerCase();
  if (!WHITELISTED_EXTENSIONS.has(ext)) {
    process.exit(0);
  }

  // (b) Debounce: skip if recently linted (cross-process via temp file)
  const key = filePath;
  const now = Date.now();
  const debounceMap = loadDebounce();
  const lastRun = debounceMap[key];
  if (lastRun && now - lastRun < DEBOUNCE_MS) {
    process.exit(0);
  }
  debounceMap[key] = now;
  // Clean old entries
  for (const k of Object.keys(debounceMap)) {
    if (now - debounceMap[k] > DEBOUNCE_MS * 6) delete debounceMap[k];
  }
  saveDebounce(debounceMap);

  // Detect formatter/linter from package.json scripts
  const cwd = process.cwd();
  const { scripts } = detectScripts(cwd);
  if (!scripts.format && !scripts.lint) {
    process.exit(0); // No tooling detected → silent no-op
  }

  // Run the tool and emit output
  const tool = scripts.lint || scripts.format;
  const cmd = scripts.lint ? "lint" : "format";

  const output = await runWithTimeout(tool, filePath, cwd, TIMEOUT_SECONDS);
  if (output && output.trim().length > 0) {
    const truncated = output.slice(0, MAX_OUTPUT_CHARS);
    emitFeedback(truncated, cmd);
  }
  process.exit(0);
} catch {
  // Fail-open: never block PostToolUse on feedback errors.
  process.exit(0);
}

// ── Helpers ────────────────────────────────────────────────────────────────

function detectScripts(cwd) {
  try {
    const pkgPath = resolve(cwd, "package.json");
    if (!existsSync(pkgPath)) return { scripts: {} };
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    const scripts = pkg.scripts || {};
    return {
      scripts: {
        format: scripts.format || null,
        lint: scripts.lint || null,
      },
    };
  } catch {
    return { scripts: {} };
  }
}

function runWithTimeout(tool, filePath, cwd, timeoutSec) {
  return new Promise((resolve) => {
    // Try running the tool on the specific file. Most tools accept a file path
    // as the last argument. If the script doesn't support per-file args, the
    // full lint will run but output will still be useful feedback.
    const parts = tool.split(/\s+/);
    const cmd = parts[0];
    // Per gemini-code-assist review: escape shell metacharacters in filePath
    // to prevent command injection via paths containing ;, &, `, $, etc.
    const safePath = '"' + filePath.replace(/(["$`\\])/g, '\\$1') + '"';
    const args = [...parts.slice(1), safePath];

    let stdout = "";
    const child = spawn(cmd, args, { cwd, shell: true, timeout: timeoutSec * 1000 });

    child.stdout?.on("data", (d) => { stdout += d.toString(); });
    child.stderr?.on("data", (d) => { stdout += d.toString(); });

    child.on("close", () => resolve(stdout));
    child.on("error", () => resolve(""));

    // Safety kill after timeout (spawn timeout may not fire on all platforms)
    setTimeout(() => {
      try { child.kill("SIGKILL"); } catch {}
      resolve(stdout);
    }, (timeoutSec + 2) * 1000);
  });
}

function emitFeedback(output, toolName) {
  const result = {
    hookSpecificOutput: {
      hookEventName: "PostToolUse",
      additionalContext: `[helpers/guard-feedback] ${toolName} output:\n${output}`,
    },
  };
  process.stdout.write(JSON.stringify(result) + "\n");
}
