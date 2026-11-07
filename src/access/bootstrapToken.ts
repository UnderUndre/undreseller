import { timingSafeEqual } from 'node:crypto'

/**
 * Bootstrap token compare (spec 002 US1, research D5, канон 007 FR-707):
 * buffer length-guard + timingSafeEqual, fail-closed when the env token is unset.
 */
export function bootstrapTokenMatches(provided: string | null | undefined): boolean {
  const expected = process.env.OWNER_BOOTSTRAP_TOKEN
  if (!provided || !expected) return false
  const a = Buffer.from(provided, 'utf-8')
  const b = Buffer.from(expected, 'utf-8')
  return a.length === b.length && timingSafeEqual(a, b)
}
