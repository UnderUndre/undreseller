import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

function loadEnvFileIfNeeded(): void {
  if (process.env.DIRECT_URL && process.env.DATABASE_URL) {
    return;
  }
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) {
    return;
  }
  const content = fs.readFileSync(envPath, 'utf-8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    let val = line.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}

function isMainModule(): boolean {
  if (typeof require !== 'undefined' && typeof module !== 'undefined') {
    return require.main === module;
  }
  return Boolean(process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('/scripts/migrate.ts'));
}

export interface MigrationRunResult {
  success: boolean;
  attempts: number;
  maintenanceFallbackTriggered: boolean;
}

export function runMigrations(
  maxRetries = 5,
  initialDelayMs = 1000,
  executor: () => void = () => {
    const directUrl = process.env.DIRECT_URL;
    if (!directUrl) {
      throw new Error('DIRECT_URL environment variable is required for migrations');
    }
    execSync('npx prisma migrate deploy', {
      stdio: 'inherit',
      env: {
        ...process.env,
        DATABASE_URL: directUrl,
        PGOPTIONS: '-c lock_timeout=2s -c statement_timeout=5s',
      },
    });
  },
  sleepFn: (ms: number) => void = (ms: number) => {
    const start = Date.now();
    while (Date.now() - start < ms) {
      // synchronous delay
    }
  }
): MigrationRunResult {
  if (isMainModule()) {
    loadEnvFileIfNeeded();
  }
  const directUrl = process.env.DIRECT_URL;
  if (!directUrl) {
    console.error('ERROR: DIRECT_URL environment variable is required for migrations');
    if (isMainModule()) {
      process.exit(1);
    }
    return { success: false, attempts: 0, maintenanceFallbackTriggered: true };
  }

  console.log('[migrate] Running Prisma 4-phase Expand/Contract migrations using DIRECT_URL...');
  let attempt = 0;
  let delay = initialDelayMs;

  while (attempt < maxRetries) {
    try {
      attempt++;
      executor();
      console.log(`[migrate] Migrations deployed successfully on attempt ${attempt}`);
      return { success: true, attempts: attempt, maintenanceFallbackTriggered: false };
    } catch (err: unknown) {
      console.warn(`[migrate] Migration attempt ${attempt}/${maxRetries} failed (possible DDL lock timeout): ${String(err)}`);
      if (attempt >= maxRetries) {
        console.error('[migrate] All migration attempts exhausted. Aborting deploy and triggering maintenance fallback.');
        if (isMainModule()) {
          process.exit(1);
        }
        return { success: false, attempts: attempt, maintenanceFallbackTriggered: true };
      }
      console.log(`[migrate] Retrying in ${delay}ms...`);
      sleepFn(delay);
      delay *= 2;
    }
  }

  return { success: false, attempts: attempt, maintenanceFallbackTriggered: true };
}

if (isMainModule()) {
  runMigrations();
}
