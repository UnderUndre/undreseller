import { timingSafeEqual } from 'node:crypto'

/**
 * Webhook secret canon (spec 004 FR-405, research D3): per-bot secret tokens,
 * timing-safe comparison; a MISSING secret is fail-closed — every request 403s
 * (canon 001 F-03), never an open endpoint.
 */
export function verifyWebhookSecret(provided: string | null | undefined, envKey: string): boolean {
  const expected = process.env[envKey]
  if (!expected) return false // fail-closed: unconfigured webhook rejects everything
  if (!provided || provided.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(provided, 'utf-8'), Buffer.from(expected, 'utf-8'))
}
