/**
 * Jest setup (per test file, T051/FR-632): install the zod@3 error-message
 * catalog over zod@4 before any schema is parsed in tests.
 */
import { installZodCompatCatalog } from '@/lib/validation/zodErrorCatalog';

installZodCompatCatalog();
