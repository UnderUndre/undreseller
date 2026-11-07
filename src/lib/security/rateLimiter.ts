/**
 * In-memory fixed-window rate limiter (spec 002-booking-domain US8, research D6;
 * канон легаси 10 req/60s + bounded registry канон 007). Single-instance only —
 * REPLICA_COUNT must be 1 (asserted at boot).
 */

interface WindowState {
  count: number
  windowStart: number
}

const buckets = new Map<string, WindowState>()
const MAX_TRACKED_KEYS = 10_000

export const RATE_LIMIT_MAX = 10
export const RATE_LIMIT_WINDOW_MS = 60_000

export function checkRateLimit(
  key: string,
  max = RATE_LIMIT_MAX,
  windowMs = RATE_LIMIT_WINDOW_MS,
  now = Date.now(),
): { allowed: boolean; retryAfterSec: number } {
  if (buckets.size > MAX_TRACKED_KEYS) {
    for (const [k, v] of buckets) {
      if (now - v.windowStart >= windowMs) buckets.delete(k)
    }
  }

  const existing = buckets.get(key)
  if (!existing || now - existing.windowStart >= windowMs) {
    buckets.set(key, { count: 1, windowStart: now })
    return { allowed: true, retryAfterSec: 0 }
  }

  existing.count += 1
  if (existing.count > max) {
    const retryAfterSec = Math.ceil((existing.windowStart + windowMs - now) / 1000)
    return { allowed: false, retryAfterSec }
  }
  return { allowed: true, retryAfterSec: 0 }
}

export function assertSingleInstance(): void {
  if (process.env.REPLICA_COUNT && process.env.REPLICA_COUNT !== '1') {
    throw new Error('RATE_LIMITER: in-memory rate limiting requires REPLICA_COUNT=1')
  }
}

/**
 * Trusted client-IP extraction (antigravity F9): with a reverse proxy the
 * socket address is the proxy, not the client — take the LAST hop of
 * x-forwarded-for that is not loopback/internal, falling back to the socket
 * address only when the header chain is exhausted.
 */
export function clientIpFrom(req: Request): string {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) {
    const hops = xff
      .split(',')
      .map((h) => h.trim())
      .filter(Boolean)
    for (let i = hops.length - 1; i >= 0; i--) {
      const hop = hops[i]
      if (!isLoopbackOrInternal(hop)) return hop
    }
  }
  return (
    req.headers.get('cf-connecting-ip') ??
    req.headers.get('x-real-ip') ??
    'unknown'
  )
}

function isLoopbackOrInternal(ip: string): boolean {
  return (
    ip === '127.0.0.1' ||
    ip === '::1' ||
    ip.startsWith('10.') ||
    ip.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip)
  )
}
