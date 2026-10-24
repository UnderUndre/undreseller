/**
 * Shared per-contact rate limiter (T091, FR-427).
 *
 * Sliding-window implementation keyed by `<route>:<contact>` (contact =
 * tgId / phone / hashed token / IP). Purely in-memory and bounded:
 *
 * OPS NOTE (single-instance only): this limiter keeps state in the Node
 * process. It is valid ONLY for a single app instance — the deployment
 * asserts `REPLICA_COUNT === '1'` (see lib/security/rateLimiter.ts
 * assertReplicaTopology). Multi-replica deployments would need a shared
 * store (e.g. Redis) before this module can be trusted.
 *
 * No PII is ever logged by this module — keys stay in memory only.
 */

const MAX_TRACKED_KEYS = 10_000;

export interface RateLimitResult {
  allowed: boolean;
  /** Requests still available inside the current window. */
  remaining: number;
  /** ms until the oldest in-window request expires (retry hint). */
  retryAfterMs: number;
}

const buckets = new Map<string, number[]>();

function evictIfNeeded(key: string): void {
  if (buckets.has(key)) return;
  while (buckets.size >= MAX_TRACKED_KEYS) {
    // Map preserves insertion order — drop the oldest key.
    const oldest = buckets.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    buckets.delete(oldest);
  }
}

/**
 * Sliding-window check: records the attempt and returns whether it is
 * allowed. Call ONLY after the request has passed cheap validation —
 * this function mutates state.
 */
export function enforceRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
  now: number = Date.now()
): RateLimitResult {
  const timestamps = buckets.get(key);
  const inWindow = timestamps
    ? timestamps.filter((t) => now - t < windowMs)
    : [];

  if (inWindow.length >= maxRequests) {
    buckets.set(key, inWindow);
    const oldest = inWindow[0];
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: Math.max(0, oldest + windowMs - now),
    };
  }

  inWindow.push(now);
  evictIfNeeded(key);
  buckets.set(key, inWindow);

  return {
    allowed: true,
    remaining: maxRequests - inWindow.length,
    retryAfterMs: 0,
  };
}

/** Test/ops helper: drop all limiter state. */
export function resetRateLimits(): void {
  buckets.clear();
}

/** Test/ops helper: number of currently tracked keys. */
export function trackedKeyCount(): number {
  return buckets.size;
}

/** Builds a namespaced limiter key: `<route>:<contact>`. */
export function rateLimitKey(route: string, contact: string): string {
  return `${route}:${contact}`;
}

// ---------------------------------------------------------------------------
// Bounded payload caps (T091, FR-427)
// ---------------------------------------------------------------------------

export const PAYLOAD_CAPS = {
  /** Booking create request body ceiling. */
  BOOKING_CREATE_BODY_BYTES: 32 * 1024,
  /** Booking cancel request body ceiling. */
  BOOKING_CANCEL_BODY_BYTES: 8 * 1024,
  /** Customer notes length (exists in lib/booking/cart.ts — mirrored here for reference). */
  CUSTOMER_NOTES_CHARS: 1000,
  /** Service address length (FR-425 boundary zod cap). */
  SERVICE_ADDRESS_CHARS: 300,
} as const;

/** Byte-size gate for raw request bodies. */
export function isPayloadWithinCap(rawBody: string | Buffer, capBytes: number): boolean {
  return Buffer.byteLength(rawBody, 'utf-8') <= capBytes;
}
