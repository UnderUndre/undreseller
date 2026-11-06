import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    // Node environment (spec 001-reinit implementation note): pg/drizzle-kit
    // pushDevSchema breaks under jsdom (sockets + prepared statements); no
    // DOM-based tests exist in the int contour.
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    include: ['tests/int/**/*.int.spec.ts'],
    // Sequential file execution (spec 001-reinit F5): parallel workers calling
    // getPayload() against a fresh `undreseller_test` race on pushDevSchema DDL
    // in Postgres (`tuple concurrently updated` / deadlocks).
    fileParallelism: false,
    // Cold `undreseller_test` boots run a full pushDevSchema (schema diff) —
    // comfortably over the default 10s hook budget on the first run.
    hookTimeout: 120_000,
    testTimeout: 60_000,
  },
})
