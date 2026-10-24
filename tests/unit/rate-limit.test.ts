/**
 * T091 (FR-427): shared sliding-window rate limiter + bounded payload caps.
 */

import {
  enforceRateLimit,
  resetRateLimits,
  trackedKeyCount,
  rateLimitKey,
  isPayloadWithinCap,
  PAYLOAD_CAPS,
} from '@/lib/security/rateLimit';

describe('FR-427: sliding-window rate limiter', () => {
  beforeEach(() => resetRateLimits());

  it('allows requests under the limit and decrements remaining', () => {
    let res = enforceRateLimit('k1', 3, 1000, 1000);
    expect(res.allowed).toBe(true);
    expect(res.remaining).toBe(2);
    res = enforceRateLimit('k1', 3, 1000, 1100);
    res = enforceRateLimit('k1', 3, 1000, 1200);
    expect(res.allowed).toBe(true);
    expect(res.remaining).toBe(0);
  });

  it('blocks the burst beyond maxRequests with retryAfterMs', () => {
    for (let i = 0; i < 3; i++) enforceRateLimit('k2', 3, 1000, 1000 + i);
    const blocked = enforceRateLimit('k2', 3, 1000, 1300);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterMs).toBe(700); // oldest (1000) + 1000 - 1300
  });

  it('slides: the window frees up as old attempts expire', () => {
    enforceRateLimit('k3', 1, 500, 1000);
    expect(enforceRateLimit('k3', 1, 500, 1200).allowed).toBe(false);
    expect(enforceRateLimit('k3', 1, 500, 1501).allowed).toBe(true);
  });

  it('isolates keys: different contacts do not share state', () => {
    expect(enforceRateLimit('a', 1, 1000, 1000).allowed).toBe(true);
    expect(enforceRateLimit('b', 1, 1000, 1000).allowed).toBe(true);
    expect(enforceRateLimit('a', 1, 1000, 1100).allowed).toBe(false);
  });

  it('rateLimitKey namespaces per route', () => {
    expect(rateLimitKey('booking_create', 'c1')).toBe('booking_create:c1');
    expect(enforceRateLimit(rateLimitKey('r', 'x'), 1, 1000, 0).allowed).toBe(true);
    expect(enforceRateLimit(rateLimitKey('r2', 'x'), 1, 1000, 0).allowed).toBe(true);
  });

  it('bounded map: evicts oldest keys beyond MAX_TRACKED_KEYS', () => {
    const max = 10_000;
    for (let i = 0; i < max + 5; i++) {
      enforceRateLimit(`bulk-${i}`, 1, 60_000, 1000);
    }
    expect(trackedKeyCount()).toBeLessThanOrEqual(max);
  });
});

describe('FR-427: bounded payload caps', () => {
  it('isPayloadWithinCap gates byte size (UTF-8 aware)', () => {
    expect(isPayloadWithinCap('a'.repeat(32 * 1024), PAYLOAD_CAPS.BOOKING_CREATE_BODY_BYTES)).toBe(true);
    expect(isPayloadWithinCap('a'.repeat(32 * 1024 + 1), PAYLOAD_CAPS.BOOKING_CREATE_BODY_BYTES)).toBe(false);
    // 2-byte Cyrillic chars count as 2 bytes each
    expect(isPayloadWithinCap('б'.repeat(20 * 1024), PAYLOAD_CAPS.BOOKING_CREATE_BODY_BYTES)).toBe(false);
  });

  it('documented cap values', () => {
    expect(PAYLOAD_CAPS.BOOKING_CREATE_BODY_BYTES).toBe(32 * 1024);
    expect(PAYLOAD_CAPS.CUSTOMER_NOTES_CHARS).toBe(1000);
    expect(PAYLOAD_CAPS.SERVICE_ADDRESS_CHARS).toBe(300);
  });
});
