import { timingSafeEqual } from 'node:crypto'

import { hashToken } from '@/lib/booking/tokens'

/**
 * Repeat-client trust cookie (spec 007 US5 / FR-706, review F1): the
 * email-allowlist was REJECTED as spoofable (a guest can claim any known
 * email without owning it). Instead — trust-the-device, not trust-the-claim:
 * an HMAC-signed HttpOnly+Secure+SameSite=Lax cookie binding the verified
 * email + issue time, TTL 90 days. Booking with a valid cookie for the SAME
 * email skips the OTP phase; without it → OTP mandatory.
 *
 * Cookie value: `b64url(email)|issuedAtMs|HMAC(trust:email:issuedAtMs)` —
 * the email travels in the client's own cookie (HttpOnly hides it from JS;
 * nothing user-untrusted can forge the MAC).
 */

export const TRUST_COOKIE_NAME = 'client_trust_token'
export const TRUST_COOKIE_TTL_DAYS = 90
const TTL_MS = TRUST_COOKIE_TTL_DAYS * 24 * 60 * 60 * 1000

export interface TrustCookieAttributes {
  httpOnly: true
  secure: true
  sameSite: 'lax'
  maxAge: number
  path: '/'
}

/** Serialization attributes for the route's Set-Cookie (spec F1 canon). */
export function trustCookieAttributes(): TrustCookieAttributes {
  return { httpOnly: true, secure: true, sameSite: 'lax', maxAge: TRUST_COOKIE_TTL_DAYS * 24 * 60 * 60, path: '/' }
}

function b64urlEncode(s: string): string {
  return Buffer.from(s, 'utf-8').toString('base64url')
}

function b64urlDecode(s: string): string | null {
  try {
    return Buffer.from(s, 'base64url').toString('utf-8')
  } catch {
    return null
  }
}

function trustMac(email: string, issuedAtMs: number): string {
  return hashToken(`trust:${email}:${issuedAtMs}`)
}

/** Mint the cookie value for a verified email (issued at `issuedAt`, default now). */
export function computeTrustToken(email: string, issuedAt: Date = new Date()): string {
  const issuedAtMs = issuedAt.getTime()
  return `${b64urlEncode(email)}|${issuedAtMs}|${trustMac(email, issuedAtMs)}`
}

export interface VerifyTrustResult {
  email: string
  issuedAtMs: number
}

/**
 * Timing-safe verification with a HARD TTL: expired, future-dated, malformed
 * or re-mailed tokens are all null. The caller must ALSO require
 * cookie.email === body email — a valid cookie authorizes only ITS email.
 */
export function verifyTrustToken(value: string | null | undefined, now: Date = new Date()): VerifyTrustResult | null {
  if (!value) return null
  const parts = value.split('|')
  if (parts.length !== 3) return null
  const email = b64urlDecode(parts[0])
  const issuedAtMs = Number(parts[1])
  if (!email || !email.includes('@') || !Number.isFinite(issuedAtMs)) return null
  const age = now.getTime() - issuedAtMs
  if (age < 0 || age > TTL_MS) return null
  const expected = Buffer.from(trustMac(email, issuedAtMs), 'utf-8')
  const provided = Buffer.from(parts[2], 'utf-8')
  if (expected.length !== provided.length) return null
  if (!timingSafeEqual(expected, provided)) return null
  return { email, issuedAtMs }
}
