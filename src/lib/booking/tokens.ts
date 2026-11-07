import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Token hashing canon: the customer cancel token (002) uses plain sha256; the
 * reschedule token (003 FR-306) uses HMAC-SHA256 keyed by PAYLOAD_SECRET. Both
 * are one-time nonces — only digests are stored, comparison is timing-safe.
 */

function secret(): string {
  const s = process.env.PAYLOAD_SECRET
  if (!s) {
    // Mirrors the boot-time fail-closed canon; unreachable when the app booted
    // via payload.config (secret is required there).
    throw new Error('PAYLOAD_SECRET is required for token hashing')
  }
  return s
}

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

export function verifySha256Token(nonce: string, storedHash: string | null | undefined): boolean {
  if (!storedHash) return false
  const computed = Buffer.from(sha256Hex(nonce), 'utf-8')
  const stored = Buffer.from(storedHash, 'utf-8')
  if (computed.length !== stored.length) return false
  return timingSafeEqual(computed, stored)
}

export function hashToken(nonce: string): string {
  return createHmac('sha256', secret()).update(nonce).digest('hex')
}

export function verifyTokenHash(nonce: string, storedHash: string | null | undefined): boolean {
  if (!storedHash) return false
  const computed = Buffer.from(hashToken(nonce), 'utf-8')
  const stored = Buffer.from(storedHash, 'utf-8')
  if (computed.length !== stored.length) return false
  return timingSafeEqual(computed, stored)
}
