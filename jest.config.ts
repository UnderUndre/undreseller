import type { Config } from 'jest';

process.env.REPLICA_COUNT ??= '1';
process.env.DATABASE_URL ??= 'postgresql://postgres:postgres@localhost:5432/undreseller?schema=public';
process.env.DIRECT_URL ??= 'postgresql://postgres:postgres@localhost:5432/undreseller?schema=public';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  // T051/FR-632: zod@3 message catalog over zod@4 — 400-shape freeze (T050/T052).
  setupFiles: ['<rootDir>/tests/zod-compat.setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  testMatch: ['**/tests/unit/**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.json', isolatedModules: true }],
  },
};

export default config;
