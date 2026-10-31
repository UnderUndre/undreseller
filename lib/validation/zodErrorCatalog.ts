/**
 * zod@4 error-catalog compatibility layer (T051, FR-632).
 *
 * zod@4 changed the default message catalog ("Required" → "Invalid input:
 * expected string, received undefined", "Invalid uuid" → "Invalid UUID",
 * "Number must be greater than 0" → "Too small: expected number to be >0").
 * FR-632 freezes the 400-shape contract (characterization snapshots, canon
 * 005 T040) — so this module re-installs the zod@3 catalog as the global
 * locale. Byte-identical 400 forms across the migration, zero per-schema
 * message overrides.
 *
 * Import this module once per process (instrumentation.ts register + jest
 * setup) before any schema is parsed. Idempotent: re-calls overwrite the
 * same config.
 */
import { z } from 'zod';

export function installZodCompatCatalog(): void {
  z.config({
    localeError: (issue) => {
      // zod@3: z.string().uuid() → "Invalid uuid"
      if (issue.code === 'invalid_format' && issue.format === 'uuid') return 'Invalid uuid';
      if (issue.code === 'invalid_format' && issue.format === 'email') return 'Invalid email';
      if (issue.code === 'invalid_format' && issue.format === 'datetime')
        return 'Invalid datetime';
      // zod@3: missing key on required field → "Required"
      // (zod@4 omits `received` for missing keys; explicit non-undefined
      // received values keep the zod@3 "Expected X, received Y" wording)
      if (issue.code === 'invalid_type') {
        if (issue.received === undefined || issue.received === 'undefined') return 'Required';
        return `Expected ${issue.expected}, received ${issue.received}`;
      }
      // zod@3: z.number().min(0, { inclusive: false }) → "Number must be greater than 0"
      if (issue.code === 'too_small' && issue.origin === 'number' && issue.inclusive === false)
        return `Number must be greater than ${issue.minimum}`;
      if (issue.code === 'too_small' && issue.origin === 'number')
        return `Number must be greater than or equal to ${issue.minimum}`;
      // Fall through to the zod@4 default catalog for everything else
      // (invalid_value/union messages already match zod@3 output).
      return z.locales.en().localeError(issue);
    },
  });
}
