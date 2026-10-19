import { execSync } from 'node:child_process';

export function runMigrations(maxRetries = 3, initialDelayMs = 1000): void {
  const directUrl = process.env.DIRECT_URL;
  if (!directUrl) {
    console.error('ERROR: DIRECT_URL environment variable is required for migrations');
    process.exit(1);
  }

  console.log('[migrate] Running Prisma migrations deploy using DIRECT_URL...');
  let attempt = 0;
  let delay = initialDelayMs;

  while (attempt < maxRetries) {
    try {
      execSync('npx prisma migrate deploy', {
        stdio: 'inherit',
        env: {
          ...process.env,
          DATABASE_URL: directUrl,
        },
      });
      console.log('[migrate] Migrations deployed successfully');
      return;
    } catch (err: unknown) {
      attempt++;
      console.warn(`[migrate] Migration attempt ${attempt} failed (possible DDL lock timeout).`);
      if (attempt >= maxRetries) {
        console.error('[migrate] All migration attempts failed:', err);
        process.exit(1);
      }
      console.log(`[migrate] Retrying in ${delay}ms...`);
      const start = Date.now();
      while (Date.now() - start < delay) {
        // synchronous delay
      }
      delay *= 2;
    }
  }
}

if (require.main === module) {
  runMigrations();
}
