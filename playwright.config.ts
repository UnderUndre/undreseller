import { defineConfig, devices } from '@playwright/test'

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
import 'dotenv/config'

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests/e2e',
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 3 : 1,
  /* Opt out of parallel tests on CI. */
  // 015 (NFR-1503, fix AG-F4): workers are pinned to 1 EVERYWHERE — parallel
  // files race on the shared dev DB (pushDevSchema DDL deadlocks — the same
  // lesson as vitest fileParallelism:false — and storefront/listing pollution).
  workers: 1,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: 'http://localhost:3000',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], channel: 'chromium' },
    },
  ],
  webServer: {
    command: 'pnpm dev',
    reuseExistingServer: true,
    url: 'http://localhost:3000',
    // 015 (fix AG-F1.2): the e2e money path runs on the fake gateway seam —
    // the spawned (or reused) dev server MUST have the flag, otherwise any
    // DEPOSIT booking 502s with PAYMENT_INIT_FAILED.
    env: {
      ...process.env,
      E2E_GATEWAY: 'fake',
      NODE_OPTIONS: '--no-deprecation --max-old-space-size=8000',
    },
  },
})
