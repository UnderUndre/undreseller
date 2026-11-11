import { randomInt } from 'node:crypto'

import { hashToken, verifyTokenHash } from '@/lib/booking/tokens'

/**
 * OTP canon (spec 007-booking-trust-gate, research D2, audit C1): a 6-digit
 * code from a crypto RNG; ONLY the HMAC digest is stored. The HMAC message
 * binds the intent context — intentId + email (review F6) — so a digest
 * lifted from one intent can never verify against another.
 */

export const OTP_TTL_MIN = 10
export const OTP_MAX_ATTEMPTS = 5
export const OTP_LENGTH = 6

/** 6-digit code from crypto RNG, zero-padded ('042917' style). */
export function generateOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(OTP_LENGTH, '0')
}

/** Context-bound HMAC of the code (F6): intentId + email + code, keyed by PAYLOAD_SECRET. */
export function computeOtpHash(intentId: string | number, email: string, code: string): string {
  return hashToken(`otp:${intentId}:${email}:${code}`)
}

/** Timing-safe verification against the stored context-bound digest. */
export function verifyOtpCode(
  intentId: string | number,
  email: string,
  code: string,
  storedHash: string | null | undefined,
): boolean {
  if (!storedHash) return false
  return verifyTokenHash(`otp:${intentId}:${email}:${code}`, storedHash)
}
