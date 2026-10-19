import { execSync } from 'node:child_process';

export function runMigrations(): void {
  const directUrl = process.env.DIRECT_URL;
  if (!directUrl) {
    console.error('ERROR: DIRECT_URL environment variable is required for migrations');
    process.exit(1);
  }

  console.log('[migrate] Running Prisma migrations deploy using DIRECT_URL...');
  try {
    execSync('npx prisma migrate deploy', {
      stdio: 'inherit',
      env: {
        ...process.env,
        DATABASE_URL: directUrl,
      },
    });
    console.log('[migrate] Migrations deployed successfully');
  } catch (err) {
    console.error('[migrate] Failed to deploy migrations:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  runMigrations();
}
