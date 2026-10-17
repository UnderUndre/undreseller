#!/usr/bin/env node
/**
 * dialog-capture.mjs — Stop hook wrapper (feature 007 US1).
 *
 * Thin wrapper (<50 LOC per contract): reads CC Stop event from stdin,
 * spawns `helpers dialog internal-capture-event` detached, exits 0 fast.
 * Fire-and-forget — never blocks CC session.
 *
 * Per F5: cross-process pidfile singleton ensures one watcher per session.
 */

import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

try {
  const raw = readFileSync(0, "utf8");
  const event = JSON.parse(raw);

  // Spawn watcher detached — this process exits immediately, watcher runs in background
  const cliPath = resolve(process.env.CLAUDE_PROJECT_DIR || process.cwd(), "packages", "cli", "dist", "cli.js");

  const child = spawn(
    process.execPath,
    [cliPath, "dialog", "internal-capture-event"],
    {
      detached: true,
      stdio: ["pipe", "ignore", "ignore"],
      cwd: process.env.CLAUDE_PROJECT_DIR || process.cwd(),
      env: { ...process.env, DIALOG_CAPTURE_EVENT: raw },
    },
  );

  // Write event to child stdin then close it
  child.stdin.write(raw);
  child.stdin.end();
  child.unref();

  process.exit(0);
} catch {
  // Fail-open: never block CC session on capture error
  process.exit(0);
}
