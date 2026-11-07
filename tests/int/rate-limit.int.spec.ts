import { describe, expect, it } from 'vitest'

import { checkRateLimit, clientIpFrom } from '@/lib/security/rateLimiter'

describe('rate limiter — fixed window boundary (TC-002-018, BVA)', () => {
  it('10th request allowed, 11th → 429 with retryAfterSec, new window → allowed', () => {
    const now = Date.now()
    const key = `rl-test-${now}`
    for (let i = 0; i < 10; i++) {
      expect(checkRateLimit(key, 10, 60_000, now + i).allowed).toBe(true)
    }
    const blocked = checkRateLimit(key, 10, 60_000, now + 10)
    expect(blocked.allowed).toBe(false)
    expect(blocked.retryAfterSec).toBeGreaterThan(0)
    // window slides past the boundary
    expect(checkRateLimit(key, 10, 60_000, now + 60_001).allowed).toBe(true)
  })
})

describe('clientIpFrom — trusted proxy extraction (antigravity F9)', () => {
  const reqWith = (headers: Record<string, string>): Request =>
    new Request('https://example.com/api/booking', { headers })

  it('takes the last non-internal hop of x-forwarded-for', () => {
    const ip = clientIpFrom(
      reqWith({ 'x-forwarded-for': '127.0.0.1, 10.0.0.5, 203.0.113.9' }),
    )
    expect(ip).toBe('203.0.113.9')
  })

  it('falls back to cf-connecting-ip / x-real-ip / unknown', () => {
    expect(clientIpFrom(reqWith({ 'cf-connecting-ip': '198.51.100.7' }))).toBe('198.51.100.7')
    expect(clientIpFrom(reqWith({ 'x-real-ip': '198.51.100.8' }))).toBe('198.51.100.8')
    expect(clientIpFrom(reqWith({}))).toBe('unknown')
  })
})
